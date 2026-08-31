import type { DatabaseSync } from 'node:sqlite';
import type { InstanceRecord } from './index.ts';
import { isAlive, procMatches } from './probe.ts';
import { releaseLock } from './lock.ts';
import { clearPidfile, readPidfile } from './pidfile.ts';
import { forceStatus } from './index.ts';

/** 监督器启动时的孤儿认领：按 pidfile/锁与进程活性（含身份校验）校正 DB 状态。 */
export function reclaim(db: DatabaseSync): string[] {
  const rows = db.prepare("SELECT * FROM instances WHERE status NOT IN ('stopped','deleted')").all() as unknown as InstanceRecord[];
  const fixed: string[] = [];
  for (const r of rows) {
    const pid = r.pid ?? readPidfile(r);
    if (pid && isAlive(pid) && procMatches(pid, r.port)) {
      if (r.status !== 'running') {
        // stale 状态校正（不走 transitionStatus，因为是校正而非业务转换）
        forceStatus(db, r.id, 'running', pid);
        fixed.push(`${r.id}: stale->running (pid ${pid})`);
      }
    } else {
      forceStatus(db, r.id, 'stopped', null);
      releaseLock(r);
      clearPidfile(r);
      fixed.push(`${r.id}: stale->stopped`);
    }
  }
  return fixed;
}
