import type { DatabaseSync } from 'node:sqlite';
import { getInstance } from './instances.ts';
import type { InstanceRecord } from './supervisor.ts';
import { getUser } from './users.ts';

export interface SubdomainInfo {
  userSlug: string;
  instanceId: string;
}

export function parseSubdomain(host: string, domain: string): SubdomainInfo | null {
  if (!host || !domain) return null;
  
  const suffix = `.${domain}`;
  if (!host.endsWith(suffix)) return null;
  
  const subdomain = host.slice(0, -suffix.length);
  const lastDash = subdomain.lastIndexOf('-');
  if (lastDash <= 0) return null;
  
  const userSlug = subdomain.slice(0, lastDash);
  const instanceId = subdomain.slice(lastDash + 1);
  
  if (!userSlug || !instanceId) return null;
  
  return { userSlug, instanceId };
}

export function buildSubdomain(userSlug: string, instanceId: string, domain: string): string {
  return `${userSlug}-${instanceId}.${domain}`;
}

export function verifyInstanceOwnership(
  db: DatabaseSync,
  info: SubdomainInfo,
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
