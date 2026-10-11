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
import { ensureProfileAllowBuilds, resolveDshCommand } from '../config.ts';
import { activePresetItems, activeAllowBuilds } from '../presets.ts';
import { runPluginAdd, readPluginsMarkerVersion, writePluginsMarker } from '../instances.ts';

export interface StartResult {
  status: 'running' | 'failed';
  pid?: number;
  error?: string;
}

export function ensureInstanceDirs(record: Pick<InstanceRecord, 'home_path' | 'workspace_path'>): void {
  for (const p of [record.home_path, record.workspace_path, join(dirname(record.home_path), 'logs')]) {
    mkdirSync(p, { recursive: true });
  }
}

/** 启动实例：建目录 → 加锁 → spawn → 探活 → 更新 DB。 */
export async function startInstance(db: DatabaseSync, record: InstanceRecord): Promise<StartResult> {
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

  ensureInstanceDirs(record);
  
  // 启动前保证插件树与**本实例将要使用的 dsh 版本**一致（详见 config.ts::resolveDshCommand）：
  //   - 无标记 → 首次安装（保留半成品树，只补装缺失插件）；
  //   - 标记记录的版本 ≠ 目标版本 → 整棵 profiles/ 是别的 dsh 版本 materialize 的，
  //     重建后再装（自愈既有坏实例：例如用 0.1.5-rc.2 装出的树被 0.2.0-rc.2 启动时
  //     `plugin tree failed to load: @deepseek-ai/dsh-sandbox-local`）。
  //   必须整棵删：node_modules 之外，package.json 的 `dsh.profile.bundles` 与
  //   cordis.yml / compatibility.json 都记着那一版的 bundle，只删 node_modules 会继续报错。
  const cmd = resolveDshCommand(record.harness_version);
  const markerVersion = readPluginsMarkerVersion(record.home_path);
  if (markerVersion === undefined || markerVersion !== cmd.version) {
    if (markerVersion !== undefined) {
      console.log(`[spawn] 插件树由 dsh@${markerVersion ?? 'unknown'} 装出，目标 dsh@${cmd.version ?? 'unknown'}，重建插件树（实例 ${record.id}）`);
      rmSync(join(record.home_path, 'profiles'), { recursive: true, force: true });
      rmSync(join(record.home_path, '.plugins-installed'), { force: true });
    } else {
      console.log(`[spawn] Installing preset plugins for instance ${record.id}...`);
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
  
  const lockToken = acquireLock(record);
  if (lockToken === null) return { status: 'failed', error: 'instance lock held by another start' };
  if (!record.port) {
    releaseLock(record, lockToken);
    return { status: 'failed', error: 'instance has no port' };
  }

  db.prepare('UPDATE instances SET status = ?, pid = NULL, last_started_at = ? WHERE id = ?')
    .run('starting', Date.now(), record.id);

  if (record.harness_version && !isValidHarnessVersion(record.harness_version)) {
    writeFailureSnapshot(record, 'invalid harness_version', `版本 ${record.harness_version} 不合法（仅允许显式 semver）`);
    transitionStatus(db, record.id, 'failed');
    clearPidfile(record);
    releaseLock(record, lockToken);
    return { status: 'failed', error: `invalid harness_version: ${record.harness_version}` };
  }

  const args = ['web', '--host', '127.0.0.1', '--port', String(record.port), '--no-open'];
  if (record.trusted_host) args.push('--trusted-host', record.trusted_host);

  // 与上面装插件用的是**同一份** dsh（`cmd`）：内置版本直接用内置二进制，其他版本走 npx。
  // 二者必须一致，否则树与进程版本错配（`plugin tree failed to load`）。
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

  const webOut = join(instanceLogDir(record), 'web.out.log');
  rotateLog(webOut);
  const fd = openSync(webOut, 'a');

  let child: ChildProcess;
  try {
    child = spawn(spawnBin, spawnArgs, {
      cwd: record.workspace_path,
      // ONEPANEL_DSH_AUTH_PROXY=1：DSH 0.1.5+ 的 dsh web 对 index/API 加了浏览器鉴权
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
