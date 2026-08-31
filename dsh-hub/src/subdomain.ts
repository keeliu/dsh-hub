import type { DatabaseSync } from 'node:sqlite';
import { getInstance } from './instances.ts';
import type { InstanceRecord } from './supervisor/index.ts';
import { getUser } from './users.ts';

export interface PathInfo {
  userSlug: string;
  instanceId: string;
}

const INSTANCE_PATH_PREFIX = '/i/';
// Instance ID 格式为 i-<8位hex>，自身含 '-'，不能用 lastIndexOf('-') 拆分
const INSTANCE_PATH_RE = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)-(i-[0-9a-f]{8})$/;

export function parseInstancePath(pathname: string): PathInfo | null {
  if (!pathname.startsWith(INSTANCE_PATH_PREFIX)) return null;
  
  const rest = pathname.slice(INSTANCE_PATH_PREFIX.length);
  const slashIndex = rest.indexOf('/');
  const segment = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
  
  if (!segment) return null;
  
  const m = segment.match(INSTANCE_PATH_RE);
  if (!m?.[1] || !m[2]) return null;
  
  return { userSlug: m[1], instanceId: m[2] };
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
  
  // 管理员/root 直接放行
  if (userRole === 'root' || userRole === 'admin') return inst;
  
  // 通过 user.id 校验归属
  if (inst.owner_id !== userId) return null;
  
  // 校验 URL 中的 slug 与实例属主的 slug 一致
  const user = getUser(db, inst.owner_id);
  if (!user || user.slug !== info.userSlug) return null;
  
  return inst;
}
