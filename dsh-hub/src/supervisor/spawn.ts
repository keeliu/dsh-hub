import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { InstanceRecord } from './index.ts';
import { START_TIMEOUT_MS, transitionStatus, forceStatus } from './index.ts';
import { isAlive, procMatches, sleep, tcpConnectable } from './probe.ts';
import { acquireLock, releaseLock } from './lock.ts';
import { clearPidfile, readPidfile, writePidfile } from './pidfile.ts';
import { instanceLogDir, rotateLog, writeFailureSnapshot, tailLog } from './log.ts';
import { stopProcessGroup } from './stop.ts';
import { isValidHarnessVersion } from '../version.ts';
import { ensureProfileAllowBuilds, resolveDshCommand, type DshCommand } from '../config.ts';
import { activePresetItems, activeAllowBuilds } from '../presets.ts';
import { runPluginAdd, readPluginsMarkerVersion, writePluginsMarker } from '../instances.ts';
import { getPrep, markStart, unmarkStart, isStartCancelled } from './prep-guard.ts';
import { patchNpxDsh } from '../npx-dsh.ts';

export interface StartResult {
  /**
   * running  ：进程已就绪；
   * starting ：插件树需要（重）建，已在后台开始准备，start 请求立即返回；
   * failed   ：启动失败（错误见 error）。
   */
  status: 'running' | 'starting' | 'failed';
  pid?: number;
  error?: string;
}

/**
 * 正在后台准备插件树的实例（进程内去重）。
 * 首次以非内置版本启动时，需要 npx 下载整棵插件树（数百 MB / 数分钟），
 * 不能让 HTTP 请求和前端轮询干等，也不能让重复点击并发装两遍。
 */
const pendingPrep = new Set<string>();

function currentStatus(db: DatabaseSync, id: string): string | undefined {
  const row = db.prepare('SELECT status FROM instances WHERE id = ?').get(id) as { status?: string } | undefined;
  return row?.status;
}

/** 后台任务失败时兜底收尾：只有仍停在 starting 才标记 failed，避免覆盖别的状态。 */
function failIfStillStarting(db: DatabaseSync, id: string): void {
  if (currentStatus(db, id) === 'starting') forceStatus(db, id, 'failed', null);
}

export function ensureInstanceDirs(record: Pick<InstanceRecord, 'home_path' | 'workspace_path'>): void {
  for (const p of [record.home_path, record.workspace_path, join(dirname(record.home_path), 'logs')]) {
    mkdirSync(p, { recursive: true });
  }
}

/**
 * 启动实例。
 *
 * 快路径（插件树已就绪）同步完成：加锁 → spawn → 探活 → 更新 DB，返回 running/failed。
 * 慢路径（插件树需要首次安装或按版本重建）**不在请求路径里等**：先把状态置为 starting，
 * 在后台装树并继续启动，立刻返回 starting，交给前端轮询。理由：首次以非内置版本启动要走
 * npx 下载整棵插件树（数百 MB、实测网络下数分钟到数十分钟），同步等待会让
 * start 请求被网关/前端超时切断（表现为「点了启动没反应」「已等待超过 60 秒」）。
 */
export async function startInstance(db: DatabaseSync, record: InstanceRecord): Promise<StartResult> {
  // 后台正在为这个实例准备插件树：重复点击直接返回 same-state，不并发装两遍
  if (pendingPrep.has(record.id)) return { status: 'starting' };

  // 已运行复查（B2）：DB 显示 running/starting 但进程已死（崩溃/pid 复用）→ 校正后继续
  if (record.status === 'running' || record.status === 'starting') {
    const pid = record.pid ?? readPidfile(record);
    if (pid && isAlive(pid) && procMatches(pid, record.port)) {
      return { status: 'running', pid };
    }
    forceStatus(db, record.id, 'stopped', null);
    clearPidfile(record);
    releaseLock(record);
  }

  // 版本合法性必须在进入后台之前校验：非法版本要立刻 502，而不是变成异步失败
  if (record.harness_version && !isValidHarnessVersion(record.harness_version)) {
    writeFailureSnapshot(record, 'invalid harness_version', `版本 ${record.harness_version} 不合法（仅允许显式 semver）`);
    forceStatus(db, record.id, 'failed', null);
    clearPidfile(record);
    return { status: 'failed', error: `invalid harness_version: ${record.harness_version}` };
  }

  ensureInstanceDirs(record);

  // 装插件与启动必须用**同一份** dsh（cmd），否则树与进程版本错配（plugin tree failed to load）
  const cmd = resolveDshCommand(record.harness_version);
  const markerVersion = readPluginsMarkerVersion(record.home_path);
  const needsPrep = markerVersion === undefined || markerVersion !== cmd.version;
  // 建实例时可能已 fire-and-forget 开始装树（instances.ts::createInstance）：
  // 必须接力等它，而不是对着同一个 DSH_HOME 并发再装一遍
  const creationPrep = getPrep(record.id);

  if (!needsPrep && !creationPrep) return await spawnAndProbe(db, record, cmd);

  if (creationPrep) {
    console.log(`[spawn] 实例 ${record.id} 建实例时的插件安装仍在进行，等它完成后启动`);
  } else if (markerVersion !== undefined) {
    console.log(`[spawn] 插件树由 dsh@${markerVersion} 装出，目标 dsh@${cmd.version ?? 'unknown'}，后台重建插件树（实例 ${record.id}）`);
  } else {
    console.log(`[spawn] 首次安装预置插件，后台进行（实例 ${record.id}，dsh@${cmd.version ?? 'unknown'}）`);
  }
  pendingPrep.add(record.id);
  markStart(record.id);
  db.prepare('UPDATE instances SET status = ?, pid = NULL, last_started_at = ? WHERE id = ?')
    .run('starting', Date.now(), record.id);

  void (async () => {
    try {
      if (creationPrep) await creationPrep.catch(() => { /* 失败留给下面重装 */ });
      // 接力完成后重新读标记：建实例那次可能刚好成功写完
      const mv = readPluginsMarkerVersion(record.home_path);
      if (mv === undefined || mv !== cmd.version) {
        await preparePluginTree(db, record, cmd, mv);
      } else {
        console.log(`[spawn] 插件树已就绪（实例 ${record.id}，dsh@${cmd.version ?? 'unknown'}）`);
      }
      // 后台准备期间可能已被 stop/delete：状态已不是 starting，或已被显式取消 → 不再拉起进程
      if (isStartCancelled(record.id) || currentStatus(db, record.id) !== 'starting') {
        console.log(`[spawn] 实例 ${record.id} 在准备插件树期间被停止/删除，放弃启动`);
        return;
      }
      const result = await spawnAndProbe(db, record, cmd);
      if (result.status === 'failed') failIfStillStarting(db, record.id);
    } catch (err) {
      console.error(`[spawn] 准备插件树失败（实例 ${record.id}）:`, err);
      failIfStillStarting(db, record.id);
    } finally {
      pendingPrep.delete(record.id);
      unmarkStart(record.id);
    }
  })();

  return { status: 'starting' };
}

/**
 * 让插件树与实例将要运行的 dsh 版本同源（详见 config.ts::resolveDshCommand）。
 *   - 标记版本 ≠ 目标版本 → 整棵 profiles/ 是别的 dsh 版本 materialize 的，先删再装
 *     （自愈既有坏实例：用 0.2.0-rc.2 装出的树被 0.2.1-alpha.2 启动时报
 *     `plugin tree failed to load: @deepseek-ai/dsh-sandbox-local`）。
 *     必须整棵删：node_modules 之外，package.json 的 `dsh.profile.bundles` 与
 *     cordis.yml / compatibility.json 都记着那一版的 bundle，只删 node_modules 会继续报错。
 *   - 无标记 → 首次安装（保留半成品树，只补装缺失插件）。
 * 装树失败不写标记、也不抛出（沿用原行为：插件失败不阻塞实例启动，下次可重试）。
 */
async function preparePluginTree(
  db: DatabaseSync,
  record: InstanceRecord,
  cmd: DshCommand,
  markerVersion: string | null | undefined,
): Promise<void> {
  if (markerVersion !== undefined && markerVersion !== cmd.version) {
    rmSync(join(record.home_path, 'profiles'), { recursive: true, force: true });
    rmSync(join(record.home_path, '.plugins-installed'), { force: true });
  }
  try {
    const items = activePresetItems(db);

    if (items.length === 0) {
      // 清单为空：无需安装，写标记避免每次启动重试
      writePluginsMarker(record.home_path, cmd.version);
      console.log(`[spawn] Preset plugin list empty for instance ${record.id}`);
    } else {
      // 配置 pnpm 允许 node-pty 等原生依赖的构建脚本（pnpm v10+ 需 allowBuilds 批准）
      ensureProfileAllowBuilds(record.home_path, activeAllowBuilds(db));
      const pnpmConfigPath = join(record.home_path, '.npmrc');
      if (!existsSync(pnpmConfigPath)) {
        writeFileSync(pnpmConfigPath, 'ignore-scripts=false\n');
        console.log(`[spawn] Created .npmrc to allow build scripts`);
      }

      let allOk = true;
      for (const item of items) {
        console.log(`[spawn] Installing plugin: ${item.spec}`);
        try {
          await runPluginAdd(cmd, item.spec, item.workspace, { cwd: record.workspace_path, dshHome: record.home_path });
          console.log(`[spawn] ✅ Plugin ${item.spec} installed successfully`);
        } catch (err) {
          allOk = false;
          console.error(`[spawn] ❌ Failed to install plugin ${item.spec}:`, err);
        }
      }
      // 只在全部插件到位后写标记（失败不写 → 下次可重试）
      if (allOk) {
        writePluginsMarker(record.home_path, cmd.version);
        console.log(`[spawn] Preset plugins installation completed for instance ${record.id}`);
      } else {
        console.log(`[spawn] Some plugins failed; marker not written for instance ${record.id} (will retry)`);
      }
    }
  } catch (err) {
    console.error(`[spawn] Plugin installation error:`, err);
    // 插件安装失败不阻塞实例启动
  }
}

/** 加锁 → spawn → 探活 → 更新 DB（调用前插件树必须已就绪）。 */
async function spawnAndProbe(db: DatabaseSync, record: InstanceRecord, cmd: DshCommand): Promise<StartResult> {
  const lockToken = acquireLock(record);
  if (lockToken === null) return { status: 'failed', error: 'instance lock held by another start' };
  // 加锁后再查一次取消：stop 可能在装树/探活之间进来（见 prep-guard 的取消握手）
  if (isStartCancelled(record.id)) {
    releaseLock(record, lockToken);
    return { status: 'failed', error: 'start cancelled by stop request' };
  }
  if (!record.port) {
    releaseLock(record, lockToken);
    return { status: 'failed', error: 'instance has no port' };
  }

  db.prepare('UPDATE instances SET status = ?, pid = NULL, last_started_at = ? WHERE id = ?')
    .run('starting', Date.now(), record.id);

  const args = ['web', '--host', '127.0.0.1', '--port', String(record.port), '--no-open'];
  if (record.trusted_host) args.push('--trusted-host', record.trusted_host);

  // 与装插件用的是**同一份** dsh（`cmd`）：内置版本直接用内置二进制，其他版本走 npx。
  const spawnBin = cmd.bin;
  const spawnArgs = [...cmd.argvPrefix, ...args];
  if (spawnBin === 'dsh') {
    const { execSync } = await import('node:child_process');
    try {
      execSync('which dsh', { stdio: 'ignore' });
    } catch {
      writeFailureSnapshot(record, 'dsh not found', 'dsh binary not found in PATH or DSH_BIN');
      transitionStatus(db, record.id, 'failed');
      clearPidfile(record);
      releaseLock(record, lockToken);
      return { status: 'failed', error: 'dsh binary not found. Please install @deepseek-ai/dsh or set DSH_BIN env.' };
    }
  }

  // npx 下载的那份 dsh 是**原始包**，镜像启动期的客户端补丁只覆盖内置副本；
  // 不在启动前补一遍，实例会 running 但首页 401（dsh web authentication required）。
  if (cmd.kind === 'npx') patchNpxDsh(cmd.version);

  const webOut = join(instanceLogDir(record), 'web.out.log');
  rotateLog(webOut);
  const fd = openSync(webOut, 'a');

  let child: ChildProcess;
  try {
    child = spawn(spawnBin, spawnArgs, {
      cwd: record.workspace_path,
      // ONEPANEL_DSH_AUTH_PROXY=1：dsh 0.1.5 起引入（基线 0.2.0-rc.2 沿用）的浏览器鉴权
      // （launch token → authority 绑定 cookie）。实例仅监听 127.0.0.1，且 hub 网关
      // 已完成鉴权+所有权+会员校验，故让 dsh 信任本代理，避免网关服务器端拉取实例 /
      // 时代收不到 cookie 而被 401（表现为“dsh web authentication required”）。
      env: { ...process.env, DSH_HOME: record.home_path, NO_COLOR: '1', ONEPANEL_DSH_AUTH_PROXY: '1' },
      stdio: ['ignore', fd, fd],
      detached: true,
    });
  } catch (e) {
    closeSync(fd);
    writeFailureSnapshot(record, 'spawn failed', String(e));
    transitionStatus(db, record.id, 'failed');
    clearPidfile(record);
    releaseLock(record, lockToken);
    return { status: 'failed', error: `spawn failed: ${String(e)}` };
  }
  closeSync(fd);

  const pgid = child.pid;
  if (!pgid) {
    writeFailureSnapshot(record, 'spawn produced no pid', 'child.pid is undefined');
    transitionStatus(db, record.id, 'failed');
    clearPidfile(record);
    releaseLock(record, lockToken);
    return { status: 'failed', error: 'spawn produced no pid' };
  }

  writePidfile(record, pgid);
  db.prepare('UPDATE instances SET pid = ? WHERE id = ?').run(pgid, record.id);

  // spawn 与上面的取消检查之间有极小窗口：spawn 之后立刻复查，已被 stop 就直接回收进程，
  // 不留「DB 说 stopped、实际有进程在跑」的孤儿（状态由 stop 路径负责推进，这里只清进程与 pid）。
  if (isStartCancelled(record.id)) {
    await stopProcessGroup(pgid, 1000);
    clearPidfile(record);
    db.prepare('UPDATE instances SET pid = NULL WHERE id = ?').run(record.id);
    releaseLock(record, lockToken);
    return { status: 'failed', error: 'start cancelled by stop request' };
  }

  const readTail = (): string => tailLog(record, 40);

  const spawnState: { error: Error | null } = { error: null };
  child.on('error', (err) => { spawnState.error = err; });
  let earlyExit = '';
  child.once('exit', (code, sig) => { earlyExit = `exit code=${code} sig=${sig}`; });

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
    child.once('exit', () => {
      // 运行期崩溃：条件更新（仅当仍是 running 时），不走 transitionStatus
      db.prepare("UPDATE instances SET status = 'failed', pid = NULL WHERE id = ? AND status = 'running'").run(record.id);
      releaseLock(record);
    });
    return { status: 'running', pid: pgid };
  }

  await stopProcessGroup(pgid, 1000);
  const detail = `端口 ${record.port} 探活失败；${abortReason || '进程未退出'}\n\n--- web.out.log 尾部 ---\n${readTail()}`;
  writeFailureSnapshot(record, 'TCP ready probe timeout', detail);
  transitionStatus(db, record.id, 'failed');
  db.prepare('UPDATE instances SET pid = NULL WHERE id = ?').run(record.id);
  clearPidfile(record);
  releaseLock(record, lockToken);
  return { status: 'failed', error: `not ready within ${START_TIMEOUT_MS / 1000}s; ${abortReason || '(no early exit, see log)'}` };
}
