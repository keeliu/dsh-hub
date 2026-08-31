export type InstanceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed';

export const VALID_TRANSITIONS: Readonly<Record<InstanceStatus, readonly InstanceStatus[]>> = {
  stopped:  ['starting'] as const,
  starting: ['running', 'failed', 'stopped'] as const,
  running:  ['stopping', 'failed'] as const,
  stopping: ['stopped', 'failed'] as const,
  failed:   ['starting', 'stopped'] as const,
};

export interface InstanceRecord {
  id: string;
  owner_id: number;
  name: string;
  port: number | null;
  home_path: string;
  workspace_path: string;
  harness_version: string | null;
  trusted_host: string;
  status: InstanceStatus;
  pid: number | null;
  auto_restart: number;
  mem_max_mb: number | null;
  cpu_quota_pct: number | null;
  created_at: number;
  last_started_at: number | null;
  dir_name?: string;
  nickname?: string;
}

export const START_TIMEOUT_MS = 180_000;
export const STOP_GRACE_MS = 8_000;
export const PORT_FREE_WAIT_MS = 2_000;
export const LOG_ROTATE_BYTES = 16 * 1024 * 1024;

export { startInstance } from './spawn.ts';
export type { StartResult } from './spawn.ts';
export { stopInstance } from './stop.ts';
export { reclaim } from './reclaim.ts';
export { tailLog } from './log.ts';
export { waitTcp, isAlive, procMatches } from './probe.ts';

import type { DatabaseSync } from 'node:sqlite';

/** 状态转换：校验合法性后更新 DB。非法转换抛错。 */
export function transitionStatus(db: DatabaseSync, id: string, to: InstanceStatus): void {
  const row = db.prepare('SELECT status FROM instances WHERE id = ?').get(id) as { status: InstanceStatus } | undefined;
  if (!row) throw new Error(`instance ${id} not found`);
  const from = row.status;
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(`invalid transition: ${from} → ${to}`);
  }
  db.prepare('UPDATE instances SET status = ? WHERE id = ?').run(to, id);
}

/** 强制状态重置（用于 reclaim/startInstance 的 stale 状态校正，不走转换表） */
export function forceStatus(db: DatabaseSync, id: string, to: InstanceStatus, pid: number | null = null): void {
  db.prepare('UPDATE instances SET status = ?, pid = ? WHERE id = ?').run(to, pid, id);
}
