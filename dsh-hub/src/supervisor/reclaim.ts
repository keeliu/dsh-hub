import type { DatabaseSync } from 'node:sqlite';
import type { InstanceRecord } from './index.ts';
import { isAlive, procMatches } from './probe.ts';
import { releaseLock } from './lock.ts';
import { clearPidfile, readPidfile } from './pidfile.ts';

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
      releaseLock(r);
      clearPidfile(r);
      fixed.push(`${r.id}: stale->stopped`);
    }
  }
  return fixed;
}
