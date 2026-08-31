/**
 * DSH Hub · 实例 CRUD 业务（M2；M2.1 事务化）
 *
 * 建实例 = 配额检查（max_instances）→ PortAllocator（TCP 探活 + DB 记账双保险）→
 * 建用户目录（700）→ 建实例目录（home/workspace/logs）→ 落库
 * （trusted_host = <slug>-<实例ID>.dshhub.local，S2 结论：精确全等子域）。
 *
 * M2.1 修复：
 * - 配额检查 + INSERT 放入 BEGIN IMMEDIATE 事务（消除并发创建超配 TOCTOU）；
 * - 实例 id 碰撞与端口撞号分开处理（此前 id 撞被误当端口撞重试）；
 * - 目录创建失败补偿删除（不残留孤儿目录）。
 * 启停交给 supervisor.ts；这里只管数据与目录。
 */
import { existsSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { withTx } from './db.ts';
import { config } from './config.ts';
import { allocatePort } from './port.ts';
import { instanceDir, instanceHome, instanceWorkspace, INSTANCE_SUBDIRS, userDir } from './paths.ts';
import { shortId, type UserRow } from './users.ts';
import type { InstanceRecord } from './supervisor/index.ts';

/** 用户昵称目录（users/<dir_name>，700）。建号时与建实例前都调用（幂等）。 */
export function ensureUserDir(dirName: string): string {
  const dir = userDir(dirName);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);
  return dir;
}

/**
 * 生成实例的 trusted_host（用于 dsh settings.yaml 的 trustedHosts）
 *
 * 注意：dsh 的 trustedHosts 只接受 host[:port] 格式，不能包含路径
 * 网关路由使用路径方式（/i/<slug>-<id>）来区分不同实例
 */
export function instanceTrustedHost(slug: string, instanceId: string): string {
  return config.hubDomain;
}

export interface CreateInstanceInput {
  name: string;
  harnessVersion?: string | null;
}

/** 新建实例（不启动）。配额不足/端口耗尽抛错。 */
export async function createInstance(db: DatabaseSync, owner: UserRow, input: CreateInstanceInput): Promise<InstanceRecord> {
  ensureUserDir(owner.dir_name);
  const name = String(input.name ?? '').trim().slice(0, 64) || `${owner.nickname}`;

  // 端口：事务外探活分配（TCP 探活有网络延迟，不能进事务）；INSERT 撞号（并发分配
  // 竞态）由 UNIQUE 兜底，事务回滚后重分配端口重试一次。
  let port = await allocatePort(db);
  for (let attempt = 0; ; attempt++) {
    try {
      return withTx(db, () => {
        // 配额检查与 INSERT 同一事务（BEGIN IMMEDIATE 串行化并发创建者）
        const used = (db.prepare('SELECT COUNT(*) AS c FROM instances WHERE owner_id = ?').get(owner.id) as { c: number }).c;
        if (used >= owner.max_instances) throw new Error(`max_instances quota reached (${owner.max_instances})`);

        // id 在事务内生成 + 查重（同步段内无竞态）
        let id = `i-${shortId(8)}`;
        while (db.prepare('SELECT 1 FROM instances WHERE id = ?').get(id)) id = `i-${shortId(8)}`;

        const dir = instanceDir(owner.dir_name, id);
        try {
          for (const sub of INSTANCE_SUBDIRS) mkdirSync(join(dir, sub), { recursive: true });
          db.prepare(
            'INSERT INTO instances (id, owner_id, name, port, home_path, workspace_path, harness_version, trusted_host, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(id, owner.id, name, port, instanceHome(owner.dir_name, id), instanceWorkspace(owner.dir_name, id),
            input.harnessVersion ?? null, instanceTrustedHost(owner.slug, id), 'stopped', Date.now());
        } catch (e) {
          rmSync(dir, { recursive: true, force: true }); // 目录补偿删除，不残留孤儿
          throw e;
        }
        return getInstance(db, id)!;
      });
    } catch (e) {
      // 仅端口撞号（并发分配竞态）重试一次；配额不足与 id 撞（已被查重排除）不再重试
      if (attempt === 0 && e instanceof Error && String(e).includes('UNIQUE')) {
        port = await allocatePort(db);
        continue;
      }
      throw e;
    }
  }
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

/** 某用户正在运行/启动中的实例（封禁时停实例用，M2.1）。 */
export function listRunningInstances(db: DatabaseSync, ownerId: number): InstanceRecord[] {
  return db.prepare("SELECT * FROM instances WHERE owner_id = ? AND status IN ('running','starting')").all(ownerId) as unknown as InstanceRecord[];
}

/** 删除实例：调用方先 stop；这里按属主 dir_name 删目录 + 删 DB 行。 */
export function deleteInstance(db: DatabaseSync, record: InstanceRecord): void {
  const owner = db.prepare('SELECT dir_name FROM users WHERE id = ?').get(record.owner_id) as { dir_name: string } | undefined;
  db.prepare('DELETE FROM instances WHERE id = ?').run(record.id);
  const dirName = record.dir_name ?? owner?.dir_name;
  if (dirName) {
    try {
      rmSync(instanceDir(dirName, record.id), { recursive: true, force: true });
    } catch (e) {
      // M2.1：不再静默吞掉，便于运维发现残留目录
      console.error(`[dsh-hub] deleteInstance: 目录残留 ${instanceDir(dirName, record.id)}:`, e);
    }
  }
}
