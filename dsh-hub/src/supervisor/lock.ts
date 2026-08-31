import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { InstanceRecord } from './index.ts';

export function lockPath(record: Pick<InstanceRecord, 'home_path'>): string {
  return join(dirname(record.home_path), '.dsh-instance.lock');
}

/**
 * 尝试获取实例锁（防双启动）：原子创建（wx）+ 写入持有者 token。
 * 返回 token（持有锁）或 null（已被持有）。fd 打开即关闭——存在性即互斥（B7）。
 */
export function acquireLock(record: Pick<InstanceRecord, 'home_path'>): string | null {
  const token = randomBytes(8).toString('hex');
  try {
    const fd = openSync(lockPath(record), 'wx');
    writeFileSync(fd, token);
    closeSync(fd);
    return token;
  } catch {
    return null;
  }
}

/**
 * 释放锁。token 传入则校验所有权（防误删他人持有的锁）；未传（force，如 reclaim/
 * stopInstance——它们由 API 层 per-instance 互斥保护，见 api.ts）则直接删除。
 */
export function releaseLock(record: Pick<InstanceRecord, 'home_path'>, token?: string | null): void {
  const path = lockPath(record);
  if (token) {
    try {
      if (readFileSync(path, 'utf8').trim() !== token) return;
    } catch {
      return;
    }
  }
  try { rmSync(path, { force: true }); } catch { /* ignore */ }
}
