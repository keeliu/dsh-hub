import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { InstanceRecord } from './index.ts';

export function instancePidfile(record: Pick<InstanceRecord, 'home_path'>): string {
  return join(dirname(record.home_path), 'instance.pid');
}

export function writePidfile(record: Pick<InstanceRecord, 'home_path'>, pid: number): void {
  writeFileSync(instancePidfile(record), String(pid));
}

export function clearPidfile(record: Pick<InstanceRecord, 'home_path'>): void {
  try { rmSync(instancePidfile(record), { force: true }); } catch { /* ignore */ }
}

export function readPidfile(record: Pick<InstanceRecord, 'home_path'>): number | null {
  try {
    const n = Number(readFileSync(instancePidfile(record), 'utf8').trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
