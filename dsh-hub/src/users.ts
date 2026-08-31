/**
 * DSH Hub · 用户与昵称/slug 规则（M1）
 *
 * - nickname：显示名与登录名，保持 Unicode（中文可用）；入库前净化（剔除 /
 *   控制字符/首尾空白/前导 .，截断 ≤64 字节，空值回退 user-<id>）——目录名规则（S5 验证）。
 * - slug：URL/子域标签，必须 ASCII [a-z0-9-]（S2 结论：DNS 标签不能有中文）。
 *   中文昵称无音译零依赖实现 ⇒ 回退 `u-<random8>`；ASCII 昵称直接降序规范化。
 * - dirName：目录名（M2 建目录时用），沿用 nickname 净化的字节截断规则。
 * - 撞名冲突处理：追加 -2/-3…（S5 验证）。
 */
import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { withTx } from './db.ts';

/** 短随机 ID（实例 ID / slug 兜底 / 目录兜底共用）。 */
export function shortId(n = 8): string {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

/** 昵称净化（与 src/index.ts 的 sanitizeNickname 一致；S5 已验证规则）。 */
export function sanitizeNickname(nickname: string, fallback = (): string => `user-${shortId(8)}`): string {
  let s = String(nickname ?? '')
    .replace(/[/\x00-\x1f\x7f]/g, '')
    .trim()
    .replace(/^\.+/, '');
  if (s === '') return fallback();
  const buf = Buffer.from(s, 'utf8');
  if (buf.byteLength <= 64) return s;
  for (let cut = 64; cut > 0; cut--) {
    const sub = buf.subarray(0, cut).toString('utf8');
    if (Buffer.byteLength(sub) <= 64 && !sub.endsWith('\uFFFD')) return sub;
  }
  return s.slice(0, 1);
}

/** 生成 ASCII slug（URL/子域标签）。中文无音译 → 回退 u-<random8>；可追加 -2/-3。 */
export function generateSlug(nickname: string, taken: (slug: string) => boolean): string {
  let base = String(nickname ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  if (base === '') base = `u-${shortId(8)}`;
  let cand = base;
  let i = 2;
  while (taken(cand)) cand = `${base}-${i++}`;
  return cand;
}

export type Role = 'user' | 'admin' | 'root';
export type UserStatus = 'active' | 'disabled';

export interface UserRow {
  id: number;
  nickname: string;
  slug: string;
  dir_name: string;
  username: string | null;
  email: string | null;
  password_hash: string;
  role: Role;
  status: UserStatus;
  max_instances: number;
  max_running: number;
  created_at: number;
  last_login_at: number | null;
}

export const USER_ROLES: readonly Role[] = ['user', 'admin', 'root'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/** 角色权限检查（M2.1 收紧，对齐计划 §3.6「root 管管理员 / admin 管用户」）：
 *  admin 只能管理 user；root 管一切；user 无管理权。 */
export function canManage(actor: Role, targetRole: Role): boolean {
  if (actor === 'root') return true;
  if (actor === 'admin') return targetRole === 'user';
  return false;
}

// ---- 数据访问（原内联于 api.ts，M2.1 归位） ----

export function getUser(db: DatabaseSync, id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getUserByNickname(db: DatabaseSync, nickname: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE nickname = ?').get(nickname) as UserRow | undefined;
}

export function getUserByUsername(db: DatabaseSync, username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function getUserByEmail(db: DatabaseSync, email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
}

/** 根据 username、email 或 nickname 查找用户（登录用，向后兼容 nickname） */
export function getUserByAccount(db: DatabaseSync, account: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ? OR email = ? OR nickname = ?').get(account, account, account) as UserRow | undefined;
}

/** 邮箱格式验证 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 用户名验证（字母数字下划线，3-32 字符） */
export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,32}$/.test(username);
}

// ---------- 用户创建 ----------

export interface CreateUserParams {
  nickname: string;
  username: string;
  email: string | null;
  passwordHash: string;
  role: Role;
  maxInstances?: number;
  maxRunning?: number;
}

/** 创建用户行：生成 slug/dir_name，插入数据库，返回新用户。 */
export function createUserRow(db: DatabaseSync, params: CreateUserParams): UserRow {
  const slug = generateSlug(params.nickname, (s) => !!db.prepare('SELECT 1 FROM users WHERE slug = ?').get(s));
  const dirName = sanitizeNickname(params.nickname);
  const id = db.prepare(
    'INSERT INTO users (nickname, slug, dir_name, username, email, password_hash, role, status, max_instances, max_running, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    params.nickname,
    slug,
    dirName,
    params.username,
    params.email,
    params.passwordHash,
    params.role,
    'active',
    params.maxInstances ?? 3,
    params.maxRunning ?? 1,
    Date.now()
  );
  return getUser(db, id.lastInsertRowid as number)!;
}

// ---------- 用户管理操作 ----------

/** 封禁用户：停实例 + 吊销会话 + 吊销 token */
export async function disableUser(
  db: DatabaseSync,
  userId: number,
  stopInstanceFn: (db: DatabaseSync, inst: any) => Promise<void>,
  listRunningFn: (db: DatabaseSync, userId: number) => any[]
): Promise<void> {
  // 停实例（事务外，异步）
  for (const inst of listRunningFn(db, userId)) {
    await stopInstanceFn(db, inst);
  }
  withTx(db, () => {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('disabled', userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(Date.now(), userId);
  });
}