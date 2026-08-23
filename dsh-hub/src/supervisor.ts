/**
 * DSH Hub · 实例监督器（M2；M2.1 健壮性大修）
 *
 * 生命周期复刻 DshController 模型（docs/02 §3.2）：
 *   spawn `dsh web --host 127.0.0.1 --port <port> --trusted-host <host> --no-open`
 *   - setsid 独立进程组（detached），env 注入 DSH_HOME，cwd = workspace，日志落盘 logs/web.out.log
 *   - TCP 就绪探活（180s）；失败写 start-fail-<ts>.md 快照
 *   - pidfile + .dsh-instance.lock（内容为持有者 token）防重拉；停止 = 进程组 TERM → 8s → KILL，确认端口释放
 *   - 版本固定：harnessVersion 非空时走 `npx --yes @deepseek-ai/dsh@<ver>`（S4 验证 ~3.2s）
 *
 * M2.1 修复（对应审查报告 B1–B10）：
 *   B1  spawn 'error' 事件处理——dsh/npx 缺失不再拖垮整个 hub；
 *   B2  运行期 exit 事件同步 DB——实例运行中崩溃后状态自动校正（不再永久 running）；
 *   B3  进程身份校验（/proc/<pid>/cmdline 含 dsh 与 --port）——防 pid 复用误杀/误标；
 *   B4  锁文件记录持有者 token，release 校验所有权；API 层另有 per-instance 互斥（api.ts）；
 *   B5  停止等待用「进程组存活」而非仅组长 pid，KILL 后确认端口释放；
 *   B6  子进程早退立即中止探活，按退出码生成失败快照（不再白等 180s）；
 *   B7  锁/日志 fd 及时关闭（不泄漏）；
 *   B8  web.out.log 超阈值轮转（落实文档「轮转式」承诺）；tailLog 改尾部读取；
 *   B10 失败路径统一清理（pidfile + 锁）。
 *
 * 状态同步 DB：status / pid / last_started_at。重启后 reclaim() 认领孤儿实例。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { instanceHome, instanceWorkspace } from './paths.ts';
import { isValidHarnessVersion } from './version.ts';

export interface InstanceRecord {
  id: string;
  owner_id: number;
  name: string;
  port: number | null;
  home_path: string;
  workspace_path: string;
  harness_version: string | null;
  trusted_host: string;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed';
  pid: number | null;
  auto_restart: number; // M5 预留
  mem_max_mb: number | null; // M5 预留
  cpu_quota_pct: number | null; // M5 预留
  created_at: number;
  last_started_at: number | null;
  /** join 出 dir_name/role 用（跨表查询时附加） */
  dir_name?: string;
  nickname?: string;
}

export const START_TIMEOUT_MS = 180_000;
export const STOP_GRACE_MS = 8_000;
export const PORT_FREE_WAIT_MS = 2_000;
export const LOG_ROTATE_BYTES = 16 * 1024 * 1024;
const TCP_PROBE_TIMEOUT_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function tcpConnectable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    const timer = setTimeout(() => { s.destroy(); resolve(false); }, TCP_PROBE_TIMEOUT_MS);
    s.once('connect', () => { clearTimeout(timer); s.destroy(); resolve(true); });
    s.once('error', () => { clearTimeout(timer); resolve(false); });
  });
}

export async function waitTcp(port: number, deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    if (await tcpConnectable(port)) return true;
    await sleep(500);
  }
  return false;
}

export function resolveDshBin(): string | null {
  const fromEnv = process.env.DSH_BIN;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const guess = join(dirname(process.execPath), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (existsSync(guess)) return guess;
  return null;
}

/** 进程是否活着（kill -0）。 */
export function isAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * 进程组是否存活（kill(-pgid, 0)）：只要组内任一进程存活即 true。
 * 比只查组长 pid 可靠（组长先死、子进程存活时仍能补杀）。
 */
function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * 进程身份校验（B3）：确认 pid 对应的是我们的 dsh web 实例（cmdline 含 dsh 特征
 * 与 --port <port>）。pid 被 OS 复用时校验失败 → 视为死实例，绝不 kill/认领。
 */
export function procMatches(pid: number, port: number | null): boolean {
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
    if (!cmdline.includes('dsh') && !cmdline.includes('@deepseek-ai')) return false;
    if (port !== null && !cmdline.includes(`--port ${port}`)) return false;
    return true;
  } catch {
    return false;
  }
}

function ensureInstanceDirs(record: Pick<InstanceRecord, 'home_path' | 'workspace_path'>): void {
  for (const p of [record.home_path, record.workspace_path, join(dirname(record.home_path), 'logs')]) {
    mkdirSync(p, { recursive: true });
  }
}

function instanceLogDir(record: Pick<InstanceRecord, 'home_path'>): string {
  return join(dirname(record.home_path), 'logs');
}

function instancePidfile(record: Pick<InstanceRecord, 'home_path'>): string {
  return join(dirname(record.home_path), 'instance.pid');
}

function lockPath(record: Pick<InstanceRecord, 'home_path'>): string {
  return join(dirname(record.home_path), '.dsh-instance.lock');
}

/**
 * 尝试获取实例锁（防双启动）：原子创建（wx）+ 写入持有者 token。
 * 返回 token（持有锁）或 null（已被持有）。fd 打开即关闭——存在性即互斥（B7）。
 */
function acquireLock(record: Pick<InstanceRecord, 'home_path'>): string | null {
  const token = randomBytes(8).toString('hex');
  try {
    const fd = openSync(lockPath(record), 'wx');
    writeFileSync(fd, token);
    closeSync(fd);
    return token;
  } catch {
    return null;
  }
}

/**
 * 释放锁。token 传入则校验所有权（防误删他人持有的锁）；未传（force，如 reclaim/
 * stopInstance——它们由 API 层 per-instance 互斥保护，见 api.ts）则直接删除。
 */
function releaseLock(record: Pick<InstanceRecord, 'home_path'>, token?: string | null): void {
  const path = lockPath(record);
  if (token) {
    try {
      if (readFileSync(path, 'utf8').trim() !== token) return;
    } catch {
      return;
    }
  }
  try { rmSync(path, { force: true }); } catch { /* ignore */ }
}

function writePidfile(record: Pick<InstanceRecord, 'home_path'>, pid: number): void {
  writeFileSync(instancePidfile(record), String(pid));
}

function clearPidfile(record: Pick<InstanceRecord, 'home_path'>): void {
  try { rmSync(instancePidfile(record), { force: true }); } catch { /* ignore */ }
}

function readPidfile(record: Pick<InstanceRecord, 'home_path'>): number | null {
  try {
    const n = Number(readFileSync(instancePidfile(record), 'utf8').trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeFailureSnapshot(record: Pick<InstanceRecord, 'home_path' | 'id'>, title: string, detail: string): void {
  const logDir = instanceLogDir(record);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(logDir, `start-fail-${ts}.md`), `# 启动失败快照\n\n- 实例: ${record.id}\n- 时间: ${new Date().toISOString()}\n- 原因: ${title}\n\n\`\`\`\n${detail.slice(0, 4000)}\n\`\`\`\n`);
}

/** web.out.log 超阈值轮转：.log → .log.1 → .log.2（B8）。 */
function rotateLog(logPath: string, maxBytes = LOG_ROTATE_BYTES): void {
  try {
    if (!existsSync(logPath) || statSync(logPath).size <= maxBytes) return;
    const bak1 = `${logPath}.1`;
    const bak2 = `${logPath}.2`;
    rmSync(bak2, { force: true });
    if (existsSync(bak1)) renameSync(bak1, bak2);
    renameSync(logPath, bak1);
  } catch { /* 轮转失败不阻塞启动 */ }
}

export interface StartResult {
  status: 'running' | 'failed';
  pid?: number;
  error?: string;
}

/** 启动实例：建目录 → 加锁 → spawn → 探活 → 更新 DB。 */
export async function startInstance(db: DatabaseSync, record: InstanceRecord): Promise<StartResult> {
  // 已运行复查（B2）：DB 显示 running/starting 但进程已死（崩溃/pid 复用）→ 校正后继续
  if (record.status === 'running' || record.status === 'starting') {
    const pid = record.pid ?? readPidfile(record);
    if (pid && isAlive(pid) && procMatches(pid, record.port)) {
      return { status: 'running', pid };
    }
    db.prepare("UPDATE instances SET status = 'stopped', pid = NULL WHERE id = ?").run(record.id);
    clearPidfile(record);
    releaseLock(record); // force：残留锁（此前持有者已死）
  }

  ensureInstanceDirs(record);
  const lockToken = acquireLock(record);
  if (lockToken === null) return { status: 'failed', error: 'instance lock held by another start' };
  if (!record.port) {
    releaseLock(record, lockToken);
    return { status: 'failed', error: 'instance has no port' };
  }

  db.prepare('UPDATE instances SET status = ?, pid = NULL, last_started_at = ? WHERE id = ?')
    .run('starting', Date.now(), record.id);

  // 版本白名单二次校验（纵深防御；API 层已拦，此处兜底 supervisor 直调场景）
  if (record.harness_version && !isValidHarnessVersion(record.harness_version)) {
    writeFailureSnapshot(record, 'invalid harness_version', `版本 ${record.harness_version} 不合法（仅允许显式 semver）`);
    db.prepare("UPDATE instances SET status = 'failed' WHERE id = ?").run(record.id);
    clearPidfile(record);
    releaseLock(record, lockToken);
    return { status: 'failed', error: `invalid harness_version: ${record.harness_version}` };
  }

  const bin = resolveDshBin();
  const args = ['web', '--host', '127.0.0.1', '--port', String(record.port), '--no-open'];
  if (record.trusted_host) args.push('--trusted-host', record.trusted_host);

  // 版本固定：harnessVersion 非空 → npx 拉对应版本（S4：冷启动 ~3.2s）
  let spawnArgs: string[] = args;
  let spawnBin: string;
  if (record.harness_version) {
    const npx = join(dirname(process.execPath), 'npx');
    spawnBin = process.execPath;
    spawnArgs = [npx, '--yes', `@deepseek-ai/dsh@${record.harness_version}`, ...args];
  } else if (bin) {
    spawnBin = process.execPath;
    spawnArgs = [bin, ...args];
  } else {
    spawnBin = 'dsh';
  }

  const webOut = join(instanceLogDir(record), 'web.out.log');
  rotateLog(webOut);
  const fd = openSync(webOut, 'a');

  let child: ChildProcess;
  try {
    child = spawn(spawnBin, spawnArgs, {
      cwd: record.workspace_path,
      env: { ...process.env, DSH_HOME: record.home_path, NO_COLOR: '1' },
      stdio: ['ignore', fd, fd],
      detached: true, // setsid：独立进程组，监督器崩溃后可存活
    });
  } catch (e) {
    closeSync(fd);
    writeFailureSnapshot(record, 'spawn failed', String(e));
    db.prepare("UPDATE instances SET status = 'failed' WHERE id = ?").run(record.id);
    clearPidfile(record);
    releaseLock(record, lockToken);
    return { status: 'failed', error: `spawn failed: ${String(e)}` };
  }
  closeSync(fd); // 父进程不保留日志 fd（B7）

  const pgid = child.pid;
  if (!pgid) {
    writeFailureSnapshot(record, 'spawn produced no pid', 'child.pid is undefined');
    db.prepare("UPDATE instances SET status = 'failed' WHERE id = ?").run(record.id);
    clearPidfile(record);
    releaseLock(record, lockToken);
    return { status: 'failed', error: 'spawn produced no pid' };
  }

  writePidfile(record, pgid);
  db.prepare('UPDATE instances SET pid = ? WHERE id = ?').run(pgid, record.id);

  // 失败快照需要拿到日志尾部
  const readTail = (): string => tailLog(record, 40);

  // B1：error 事件必须监听（ENOENT 等异步失败；无监听会 uncaughtException 拖垮 hub）
  // 注意：用对象属性承载（TS 对「仅闭包内赋值的 let」在闭包外视为初始值，收窄失效）
  const spawnState: { error: Error | null } = { error: null };
  child.on('error', (err) => { spawnState.error = err; });
  // B6：未就绪前早退 → 立即中止探活
  let earlyExit = '';
  child.once('exit', (code, sig) => { earlyExit = `exit code=${code} sig=${sig}`; });

  // B6：带中止条件的就绪探活（error/exit 出现即停，不再白等 180s）
  const deadline = Date.now() + START_TIMEOUT_MS;
  let ready = false;
  let abortReason = '';
  while (Date.now() < deadline) {
    const err = spawnState.error;
    if (err) { abortReason = `spawn error: ${err.message}`; break; }
    if (earlyExit !== '') { abortReason = earlyExit; break; }
    if (await tcpConnectable(record.port)) { ready = true; break; }
    await sleep(500);
  }

  if (ready) {
    db.prepare('UPDATE instances SET status = ?, pid = ?, last_started_at = ? WHERE id = ?')
      .run('running', pgid, Date.now(), record.id);
    // B2：运行期退出同步 DB（仅当仍是 running——用户主动 stop 时 status 已非 running，不覆盖）
    child.once('exit', () => {
      db.prepare("UPDATE instances SET status = 'failed', pid = NULL WHERE id = ? AND status = 'running'").run(record.id);
      releaseLock(record); // force：实例已死，清残留锁
    });
    return { status: 'running', pid: pgid };
  }

  // 未就绪：收尾（TERM → 1s → KILL 整个进程组），统一清理（B10）
  await stopProcessGroup(pgid, 1000);
  const detail = `端口 ${record.port} 探活失败；${abortReason || '进程未退出'}\n\n--- web.out.log 尾部 ---\n${readTail()}`;
  writeFailureSnapshot(record, 'TCP ready probe timeout', detail);
  db.prepare("UPDATE instances SET status = 'failed', pid = NULL WHERE id = ?").run(record.id);
  clearPidfile(record);
  releaseLock(record, lockToken);
  return { status: 'failed', error: `not ready within ${START_TIMEOUT_MS / 1000}s; ${abortReason || '(no early exit, see log)'}` };
}

async function stopProcessGroup(pid: number, graceMs: number): Promise<void> {
  try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { return; } }
  const deadline = Date.now() + graceMs;
  // B5：等「进程组」清空（组内任何进程存活都继续等），而非只等组长
  while (Date.now() < deadline && groupAlive(pid)) await sleep(200);
  if (groupAlive(pid)) {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ } }
    await sleep(300);
  }
}

/** 等待端口不再可连（停止后确认端口释放，B5）。 */
async function waitPortFree(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await tcpConnectable(port))) return true;
    await sleep(200);
  }
  return !(await tcpConnectable(port));
}

/** 停止实例：TERM 进程组 → 8s → KILL；释放锁并确认端口释放。 */
export async function stopInstance(db: DatabaseSync, record: InstanceRecord, opts: { force?: boolean } = {}): Promise<void> {
  if (record.status === 'stopped' && !isAlive(record.pid)) return;
  db.prepare('UPDATE instances SET status = ? WHERE id = ?').run('stopping', record.id);
  const pid = record.pid ?? readPidfile(record);
  if (pid && isAlive(pid) && procMatches(pid, record.port)) {
    await stopProcessGroup(pid, STOP_GRACE_MS);
  }
  releaseLock(record); // force：API 层 per-instance 互斥保证无 start 在途
  clearPidfile(record);
  if (record.port) await waitPortFree(record.port, PORT_FREE_WAIT_MS);
  db.prepare('UPDATE instances SET status = ?, pid = NULL WHERE id = ?').run('stopped', record.id);
}

/** 监督器启动时的孤儿认领：按 pidfile/锁与进程活性（含身份校验）校正 DB 状态。 */
export function reclaim(db: DatabaseSync): string[] {
  const rows = db.prepare("SELECT * FROM instances WHERE status NOT IN ('stopped','deleted')").all() as unknown as InstanceRecord[];
  const fixed: string[] = [];
  for (const r of rows) {
    const pid = r.pid ?? readPidfile(r);
    if (pid && isAlive(pid) && procMatches(pid, r.port)) {
      if (r.status !== 'running') {
        db.prepare("UPDATE instances SET status = 'running' WHERE id = ?").run(r.id);
        fixed.push(`${r.id}: stale->running (pid ${pid})`);
      }
    } else {
      db.prepare("UPDATE instances SET status = 'stopped', pid = NULL WHERE id = ?").run(r.id);
      releaseLock(r); // force：残留锁清理
      clearPidfile(r);
      fixed.push(`${r.id}: stale->stopped`);
    }
  }
  return fixed;
}

/** 日志尾部读取（B8）：只读文件末尾 ≤64KiB，不再整文件读入内存。 */
export function tailLog(record: Pick<InstanceRecord, 'home_path'>, tail = 200): string {
  const logPath = join(instanceLogDir(record), 'web.out.log');
  const READ_BACK = 64 * 1024;
  try {
    const size = statSync(logPath).size;
    const offset = Math.max(0, size - READ_BACK);
    const fd = openSync(logPath, 'r');
    try {
      const buf = Buffer.alloc(size - offset);
      let pos = 0;
      while (pos < buf.length) {
        const n = readSync(fd, buf, pos, buf.length - pos, offset + pos);
        if (n <= 0) break;
        pos += n;
      }
      const lines = buf.toString('utf8').split('\n');
      return lines.slice(-tail).join('\n');
    } finally {
      closeSync(fd);
    }
  } catch {
    return '(no log yet)';
  }
}
