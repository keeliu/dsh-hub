/**
 * DSH Hub · 数据根与目录布局（M2）
 *
 * 布局（docs/02 §3.1）：
 *   <dataDir>/dshhub.db
 *   <dataDir>/users/<dir_name>/            (700)
 *     instances/<实例ID>/
 *       home/        = DSH_HOME
 *       workspace/   = dsh 进程 cwd
 *       logs/        = web.out.log + start-fail-<ts>.md
 *       instance.pid + .dsh-instance.lock
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function dataDir(): string {
  return process.env.DSH_HUB_DATA ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
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