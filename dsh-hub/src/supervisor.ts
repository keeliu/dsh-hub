/**
 * DSH Hub · 实例监督器（M2）
 *
 * 生命周期复刻 DshController 模型（docs/02 §3.2）：
 *   spawn `dsh web --host 127.0.0.1 --port <port> --trusted-host <host> --no-open`
 *   - setsid 独立进程组（detached），env 注入 DSH_HOME，cwd = workspace，日志落盘 logs/web.out.log
 *   - TCP 就绪探活（180s）；失败写 start-fail-<ts>.md 快照
 *   - pidfile + .dsh-instance.lock 防重拉；停止 = 进程组 TERM → 8s → KILL，确认端口释放
 *   - 版本固定：harnessVersion 非空时走 `npx --yes @deepseek-ai/dsh@<ver>`（S4 验证 ~3.2s）
 *
 * 状态同步 DB：status / pid / last_started_at。重启后 reclaim() 认领孤儿实例。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import net from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import { instanceHome, instanceWorkspace, INSTANCE_SUBDIRS } from './paths.ts';

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
  auto_restart: number;
  mem_max_mb: number | null;
  cpu_quota_pct: number | null;
  created_at: number;
  last_started_at: number | null;
  /** join 出 dir_name/role 用（跨表查询时附加） */
  dir_name?: string;
  nickname?: string;
}

export const START_TIMEOUT_MS = 180_000;
export const STOP_GRACE_MS = 8_000;

function tcpConnectable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

export async function waitTcp(port: number, deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    if (await tcpConnectable(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
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

function ensureInstanceDirs(record: Pick<InstanceRecord, 'home_path' | 'workspace_path'>): void {
  for (const p of [record.home_path, record.workspace_path, join(dirname(record.home_path), 'logs')]) {
    mkdirSync(p, { recursive: true });
  }
}

function instanceLogDir(record: Pick<InstanceRecord, 'home_path'>): string {
  return join(dirname(record.home_path), 'logs');
}

/** 尝试获取实例锁（防双启动）。返回 fd 或 null（已有锁）。 */
function acquireLock(record: Pick<InstanceRecord, 'home_path'>): number | null {
  const lockPath = join(dirname(record.home_path), '.dsh-instance.lock');
  try {
    return openSync(lockPath, 'wx');
  } catch {
    return null;
  }
}

function releaseLock(record: Pick<InstanceRecord, 'home_path'>): void {
  try { rmSync(join(dirname(record.home_path), '.dsh-instance.lock'), { force: true }); } catch { /* ignore */ }
}

function writePidfile(record: Pick<InstanceRecord, 'home_path'>, pid: number): void {
  writeFileSync(join(dirname(record.home_path), 'instance.pid'), String(pid));
}

function readPidfile(record: Pick<InstanceRecord, 'home_path'>): number | null {
  try {
    const n = Number(readFileSync(join(dirname(record.home_path), 'instance.pid'), 'utf8').trim());
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

export interface StartResult {
  status: 'running' | 'failed';
  pid?: number;
  error?: string;
}

/** 启动实例：建目录 → 加锁 → spawn → 探活 → 更新 DB。 */
export async function startInstance(db: DatabaseSync, record: InstanceRecord): Promise<StartResult> {
  if (record.status === 'running' || record.status === 'starting') return { status: 'running', pid: record.pid ?? undefined };
  ensureInstanceDirs(record);
  const lockFd = acquireLock(record);
  if (lockFd === null) return { status: 'failed', error: 'instance lock held by another start' };
  if (!record.port) return { status: 'failed', error: 'instance has no port' };

  db.prepare('UPDATE instances SET status = ?, pid = NULL, last_started_at = ? WHERE id = ?')
    .run('starting', Date.now(), record.id);

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
  const fd = openSync(webOut, 'a');

  const child = spawn(spawnBin, spawnArgs, {
    cwd: record.workspace_path,
    env: { ...process.env, DSH_HOME: record.home_path, NO_COLOR: '1' },
    stdio: ['ignore', fd, fd],
    detached: true, // setsid：独立进程组，监督器崩溃后可存活
  });
  const pgid = child.pid!; // detached 子进程即进程组组长（spawn 成功即必有 pid）
  writePidfile(record, pgid);
  db.prepare('UPDATE instances SET pid = ? WHERE id = ?').run(pgid, record.id);

  // 失败快照需要拿到日志尾部
  const readTail = (): string => {
    try {
      const buf = readFileSync(webOut, 'utf8');
      return buf.split('\n').slice(-40).join('\n');
    } catch { return '(no log)'; }
  };

  let earlyExit = '';
  child.once('exit', (code, sig) => { earlyExit = `exit code=${code} sig=${sig}`; });

  const ready = await waitTcp(record.port, Date.now() + START_TIMEOUT_MS);
  if (ready) {
    db.prepare('UPDATE instances SET status = ?, pid = ?, last_started_at = ? WHERE id = ?')
      .run('running', pgid, Date.now(), record.id);
    return { status: 'running', pid: pgid };
  }

  // 未就绪：收尾（TERM → 1s → KILL）
  await stopProcessGroup(pgid, 1000);
  const detail = `端口 ${record.port} 探活失败；${earlyExit || '进程未退出'}\n\n--- web.out.log 尾部 ---\n${readTail()}`;
  writeFailureSnapshot(record, 'TCP ready probe timeout', detail);
  db.prepare('UPDATE instances SET status = ?, pid = NULL WHERE id = ?').run('failed', record.id);
  releaseLock(record);
  return { status: 'failed', error: `not ready within ${START_TIMEOUT_MS / 1000}s; ${earlyExit || '(no early exit, see log)'}` };
}

async function stopProcessGroup(pid: number, graceMs: number): Promise<void> {
  try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { return; } }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline && isAlive(pid)) await new Promise((r) => setTimeout(r, 200));
  if (isAlive(pid)) {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ } }
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** 停止实例：TERM 进程组 → 8s → KILL；释放锁并确认端口释放。 */
export async function stopInstance(db: DatabaseSync, record: InstanceRecord, opts: { force?: boolean } = {}): Promise<void> {
  if (record.status === 'stopped' && !isAlive(record.pid)) return;
  db.prepare('UPDATE instances SET status = ? WHERE id = ?').run('stopping', record.id);
  const pid = record.pid ?? readPidfile(record);
  if (pid && isAlive(pid)) {
    try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ } }
    const deadline = Date.now() + STOP_GRACE_MS;
    while (Date.now() < deadline && isAlive(pid)) await new Promise((r) => setTimeout(r, 200));
    if (isAlive(pid)) {
      try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ } }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  releaseLock(record);
  try { rmSync(join(dirname(record.home_path), 'instance.pid'), { force: true }); } catch { /* ignore */ }
  db.prepare('UPDATE instances SET status = ?, pid = NULL WHERE id = ?').run('stopped', record.id);
}

/** 监督器启动时的孤儿认领：按 pidfile/锁与进程活性校正 DB 状态。 */
export function reclaim(db: DatabaseSync): string[] {
  const rows = db.prepare("SELECT * FROM instances WHERE status NOT IN ('stopped','deleted')").all() as unknown as InstanceRecord[];
  const fixed: string[] = [];
  for (const r of rows) {
    const pid = r.pid ?? readPidfile(r);
    if (pid && isAlive(pid)) {
      if (r.status !== 'running') {
        db.prepare("UPDATE instances SET status = 'running' WHERE id = ?").run(r.id);
        fixed.push(`${r.id}: stale->running (pid ${pid})`);
      }
    } else {
      db.prepare("UPDATE instances SET status = 'stopped', pid = NULL WHERE id = ?").run(r.id);
      releaseLock(r);
      fixed.push(`${r.id}: stale->stopped`);
    }
  }
  return fixed;
}

export function tailLog(record: Pick<InstanceRecord, 'home_path'>, tail = 200): string {
  const logPath = join(instanceLogDir(record), 'web.out.log');
  try {
    const lines = readFileSync(logPath, 'utf8').split('\n');
    return lines.slice(-tail).join('\n');
  } catch {
    return '(no log yet)';
  }
}