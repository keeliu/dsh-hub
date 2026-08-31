import type { DatabaseSync } from 'node:sqlite';
import { getInstance } from './instances.ts';
import type { InstanceRecord } from './supervisor.ts';
import { getUser } from './users.ts';

export interface PathInfo {
  userSlug: string;
  instanceId: string;
}

const INSTANCE_PATH_PREFIX = '/i/';

export function parseInstancePath(pathname: string): PathInfo | null {
  if (!pathname.startsWith(INSTANCE_PATH_PREFIX)) return null;
  
  const rest = pathname.slice(INSTANCE_PATH_PREFIX.length);
  const slashIndex = rest.indexOf('/');
  const segment = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
  
  if (!segment) return null;
  
  const lastDash = segment.lastIndexOf('-');
  if (lastDash <= 0) return null;
  
  const userSlug = segment.slice(0, lastDash);
  const instanceId = segment.slice(lastDash + 1);
  
  if (!userSlug || !instanceId) return null;
  
  return { userSlug, instanceId };
}

export function buildInstancePath(userSlug: string, instanceId: string): string {
  return `${INSTANCE_PATH_PREFIX}${userSlug}-${instanceId}`;
}

export function buildInstanceUrl(userSlug: string, instanceId: string, domain: string): string {
  const protocol = 'https';
  return `${protocol}://${domain}${buildInstancePath(userSlug, instanceId)}`;
}

export function verifyInstanceOwnership(
  db: DatabaseSync,
  info: PathInfo,
  userId: number,
  userRole: string
): InstanceRecord | null {
  const inst = getInstance(db, info.instanceId);
  if (!inst) return null;
  
  if (inst.owner_id !== userId && userRole !== 'root' && userRole !== 'admin') {
    return null;
  }
  
  const user = getUser(db, inst.owner_id);
  if (!user || user.dir_name !== info.userSlug) {
    return null;
  }
  
  return inst;
}
