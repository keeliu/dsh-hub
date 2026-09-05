import { spawn, type ChildProcess, execSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
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
import { getDshBin, DEFAULT_PLUGINS } from '../config.ts';

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

export function resolveDshBin(): string | null {
  return getDshBin();
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
  
  // 首次启动时自动安装默认插件
  const pluginInstallFlag = join(record.home_path, '.plugins-installed');
  if (!existsSync(pluginInstallFlag)) {
    console.log(`[spawn] Installing default plugins for instance ${record.id}...`);
    try {
      const bin = resolveDshBin() || 'dsh';
      
      // 配置 pnpm 允许 node-pty 等包的构建脚本
      const pnpmConfigPath = join(record.home_path, '.npmrc');
      if (!existsSync(pnpmConfigPath)) {
        writeFileSync(pnpmConfigPath, 'ignore-scripts=false\n');
        console.log(`[spawn] Created .npmrc to allow build scripts`);
      }
      
      let allOk = true;
      for (const plugin of DEFAULT_PLUGINS) {
        console.log(`[spawn] Installing plugin: ${plugin}`);
        try {
          const isImPlugin = plugin.includes('dsh-im');
          const cmd = isImPlugin
            ? `${bin} plugin --profile web add -w ${plugin}`
            : `${bin} plugin --profile web add ${plugin}`;
          
          execSync(cmd, {
            cwd: record.workspace_path,
            env: { ...process.env, DSH_HOME: record.home_path },
            stdio: 'pipe',
            timeout: 120000, // 120 秒超时（原生编译需要更长时间）
          });
          console.log(`[spawn] ✅ Plugin ${plugin} installed successfully`);
        } catch (err) {
          allOk = false;
          console.error(`[spawn] ❌ Failed to install plugin ${plugin}:`, err);
        }
      }
      // 只在全部插件到位后写标记（失败不写 → 下次可重试）
      if (allOk) {
        writeFileSync(pluginInstallFlag, new Date().toISOString());
        console.log(`[spawn] Default plugins installation completed for instance ${record.id}`);
      } else {
        console.log(`[spawn] Some plugins failed; marker not written for instance ${record.id} (will retry)`);
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

  const bin = resolveDshBin();
  const args = ['web', '--host', '127.0.0.1', '--port', String(record.port), '--no-open'];
  if (record.trusted_host) args.push('--trusted-host', record.trusted_host);

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
