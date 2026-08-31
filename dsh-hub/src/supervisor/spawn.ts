import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { InstanceRecord } from './index.ts';
import { START_TIMEOUT_MS } from './index.ts';
import { isAlive, procMatches, sleep, tcpConnectable } from './probe.ts';
import { acquireLock, releaseLock } from './lock.ts';
import { clearPidfile, readPidfile, writePidfile } from './pidfile.ts';
import { instanceLogDir, rotateLog, writeFailureSnapshot, tailLog } from './log.ts';
import { stopProcessGroup } from './stop.ts';
import { isValidHarnessVersion } from '../version.ts';

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
  const fromEnv = process.env.DSH_BIN;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const guess = join(dirname(process.execPath), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (existsSync(guess)) return guess;
  return null;
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
    releaseLock(record);
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
      db.prepare("UPDATE instances SET status = 'failed' WHERE id = ?").run(record.id);
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
    db.prepare("UPDATE instances SET status = 'failed' WHERE id = ?").run(record.id);
    clearPidfile(record);
    releaseLock(record, lockToken);
    return { status: 'failed', error: `spawn failed: ${String(e)}` };
  }
  closeSync(fd);

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
      db.prepare("UPDATE instances SET status = 'failed', pid = NULL WHERE id = ? AND status = 'running'").run(record.id);
      releaseLock(record);
    });
    return { status: 'running', pid: pgid };
  }

  await stopProcessGroup(pgid, 1000);
  const detail = `端口 ${record.port} 探活失败；${abortReason || '进程未退出'}\n\n--- web.out.log 尾部 ---\n${readTail()}`;
  writeFailureSnapshot(record, 'TCP ready probe timeout', detail);
  db.prepare("UPDATE instances SET status = 'failed', pid = NULL WHERE id = ?").run(record.id);
  clearPidfile(record);
  releaseLock(record, lockToken);
  return { status: 'failed', error: `not ready within ${START_TIMEOUT_MS / 1000}s; ${abortReason || '(no early exit, see log)'}` };
}
