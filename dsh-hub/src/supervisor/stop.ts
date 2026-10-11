import type { DatabaseSync } from 'node:sqlite';
import type { InstanceRecord } from './index.ts';
import { PORT_FREE_WAIT_MS, STOP_GRACE_MS, transitionStatus } from './index.ts';
import { groupAlive, isAlive, procMatches, sleep, tcpConnectable } from './probe.ts';
import { releaseLock } from './lock.ts';
import { clearPidfile, readPidfile } from './pidfile.ts';
import { isStartInFlight, cancelStart } from './prep-guard.ts';

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
  // 异步启动在途（首次装插件树可能数分钟，实例一直显示 starting）→ 先登记取消，
  // 后台任务随后在 spawn 前后看到标记就放弃拉起，避免「点了停止又自己跑起来」。
  if (isStartInFlight(record.id)) cancelStart(record.id);
  transitionStatus(db, record.id, 'stopping');
  // 重新读一次 pid：异步启动可能刚好把进程拉起并写入 pid/pidfile（上面那次读的是旧快照）
  const fresh = db.prepare('SELECT pid FROM instances WHERE id = ?').get(record.id) as { pid: number | null } | undefined;
  const pid = fresh?.pid ?? record.pid ?? readPidfile(record);
  if (pid && isAlive(pid) && procMatches(pid, record.port)) {
    await stopProcessGroup(pid, STOP_GRACE_MS);
  }
  releaseLock(record);
  clearPidfile(record);
  if (record.port) await waitPortFree(record.port, PORT_FREE_WAIT_MS);
  transitionStatus(db, record.id, 'stopped');
  db.prepare('UPDATE instances SET pid = NULL WHERE id = ?').run(record.id);
}
