import type { DatabaseSync } from 'node:sqlite';
import type { InstanceRecord } from './index.ts';
import { PORT_FREE_WAIT_MS, STOP_GRACE_MS } from './index.ts';
import { groupAlive, isAlive, procMatches, sleep, tcpConnectable } from './probe.ts';
import { releaseLock } from './lock.ts';
import { clearPidfile, readPidfile } from './pidfile.ts';

export async function stopProcessGroup(pid: number, graceMs: number): Promise<void> {
  try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { return; } }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline && groupAlive(pid)) await sleep(200);
  if (groupAlive(pid)) {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ } }
    await sleep(300);
  }
}

/** 等待端口不再可连（停止后确认端口释放，B5）。 */
export async function waitPortFree(port: number, timeoutMs: number): Promise<boolean> {
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
  releaseLock(record);
  clearPidfile(record);
  if (record.port) await waitPortFree(record.port, PORT_FREE_WAIT_MS);
  db.prepare('UPDATE instances SET status = ?, pid = NULL WHERE id = ?').run('stopped', record.id);
}
