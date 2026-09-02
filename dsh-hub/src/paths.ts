/**
 * DSH Hub · 数据根与目录布局（M2）
 *
 * 布局（docs/02 §3.1）：
 *   <dataDir>/dshhub.db
 *   <dataDir>/users/<dir_name>/            (700)
 *     instances/<实例 ID>/
 *       home/        = DSH_HOME
 *       workspace/   = dsh 进程 cwd
 *       logs/        = web.out.log + start-fail-<ts>.md
 *       instance.pid + .dsh-instance.lock
 */
import { join } from 'node:path';
import { getDataDir } from './config.ts';

export function dataDir(): string {
  return getDataDir();
}

export function userRoot(): string {
  return join(dataDir(), 'users');
}

export function userDir(dirName: string): string {
  return join(userRoot(), dirName);
}

export function instanceDir(dirName: string, instanceId: string): string {
  return join(userDir(dirName), 'instances', instanceId);
}

export const INSTANCE_SUBDIRS = ['home', 'workspace', 'logs'] as const;

export function instanceHome(dirName: string, instanceId: string): string {
  return join(instanceDir(dirName, instanceId), 'home');
}

export function instanceWorkspace(dirName: string, instanceId: string): string {
  return join(instanceDir(dirName, instanceId), 'workspace');
}
