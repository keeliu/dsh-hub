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
