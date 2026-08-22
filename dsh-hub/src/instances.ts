/**
 * DSH Hub · 实例 CRUD 业务（M2）
 *
 * 建实例 = 配额检查（max_instances）→ PortAllocator（TCP 探活 + DB 记账双保险）→
 * 建用户目录（700）→ 建实例目录（home/workspace/logs）→ 落库
 * （trusted_host = <slug>-<实例ID>.dshhub.local，S2 结论：精确全等子域）。
 * 启停交给 supervisor.ts；这里只管数据与目录。
 */
import { existsSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { allocatePort } from './port.ts';
import { instanceDir, instanceHome, instanceWorkspace, INSTANCE_SUBDIRS, userDir } from './paths.ts';
import { shortId, type UserRow } from './users.ts';
import type { InstanceRecord } from './supervisor.ts';

export const HUB_DOMAIN_SUFFIX = process.env.DSH_HUB_DOMAIN ?? 'dshhub.local';

/** 用户昵称目录（users/<dir_name>，700）。建号时与建实例前都调用（幂等）。 */
export function ensureUserDir(dirName: string): string {
  const dir = userDir(dirName);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);
  return dir;
}

export function instanceTrustedHost(slug: string, instanceId: string): string {
  return `${slug}-${instanceId}.${HUB_DOMAIN_SUFFIX}`;
}

export interface CreateInstanceInput {
  name: string;
  harnessVersion?: string | null;
}

/** 新建实例（不启动）。配额不足/端口耗尽抛错。 */
export async function createInstance(db: DatabaseSync, owner: UserRow, input: CreateInstanceInput): Promise<InstanceRecord> {
  const used = (db.prepare('SELECT COUNT(*) AS c FROM instances WHERE owner_id = ?').get(owner.id) as { c: number }).c;
  if (used >= owner.max_instances) throw new Error(`max_instances quota reached (${owner.max_instances})`);

  const id = `i-${shortId(8)}`;
  const name = String(input.name ?? '').trim().slice(0, 64) || `${owner.nickname}-${id}`;
  ensureUserDir(owner.dir_name);
  const dir = instanceDir(owner.dir_name, id);
  for (const sub of INSTANCE_SUBDIRS) mkdirSync(join(dir, sub), { recursive: true });
  const trustedHost = instanceTrustedHost(owner.slug, id);

  // 端口：先探活分配，再插入（port UNIQUE 防并发撞号；撞了重试一次）
  let port = await allocatePort(db);
  try {
    db.prepare(
      'INSERT INTO instances (id, owner_id, name, port, home_path, workspace_path, harness_version, trusted_host, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, owner.id, name, port, instanceHome(owner.dir_name, id), instanceWorkspace(owner.dir_name, id),
      input.harnessVersion ?? null, trustedHost, 'stopped', Date.now());
  } catch (e) {
    if (!String(e).includes('UNIQUE')) throw e;
    port = await allocatePort(db); // 撞号重试
    db.prepare(
      'INSERT INTO instances (id, owner_id, name, port, home_path, workspace_path, harness_version, trusted_host, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, owner.id, name, port, instanceHome(owner.dir_name, id), instanceWorkspace(owner.dir_name, id),
      input.harnessVersion ?? null, trustedHost, 'stopped', Date.now());
  }
  const row = db.prepare('SELECT * FROM instances WHERE id = ?').get(id) as unknown as InstanceRecord;
  return row;
}

export function listInstances(db: DatabaseSync, ownerId: number): InstanceRecord[] {
  return db.prepare('SELECT * FROM instances WHERE owner_id = ? ORDER BY created_at').all(ownerId) as unknown as InstanceRecord[];
}

export function getInstance(db: DatabaseSync, id: string): InstanceRecord | undefined {
  return db.prepare('SELECT * FROM instances WHERE id = ?').get(id) as InstanceRecord | undefined;
}

/** 跨用户视图（管理员）：join 出属主昵称。 */
export function listAllInstances(db: DatabaseSync): (InstanceRecord & { nickname?: string; dir_name?: string })[] {
  return db.prepare(
    'SELECT i.*, u.nickname, u.dir_name FROM instances i LEFT JOIN users u ON u.id = i.owner_id ORDER BY i.created_at'
  ).all() as unknown as (InstanceRecord & { nickname?: string; dir_name?: string })[];
}

/** 某用户当前 running/starting 实例数（max_running 配额）。 */
export function runningCount(db: DatabaseSync, ownerId: number): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM instances WHERE owner_id = ? AND status IN ('running','starting')").get(ownerId) as { c: number };
  return row.c;
}

/** 删除实例：调用方先 stop；这里按属主 dir_name 删目录 + 删 DB 行。 */
export function deleteInstance(db: DatabaseSync, record: InstanceRecord): void {
  const owner = db.prepare('SELECT dir_name FROM users WHERE id = ?').get(record.owner_id) as { dir_name: string } | undefined;
  db.prepare('DELETE FROM instances WHERE id = ?').run(record.id);
  const dirName = record.dir_name ?? owner?.dir_name;
  if (dirName) {
    try { rmSync(instanceDir(dirName, record.id), { recursive: true, force: true }); } catch { /* ignore */ }
  }
}