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

/** 角色权限检查：target 允许的 action 是否可被 actor 执行（admin 管 user；root 管一切）。 */
export function canManage(actor: Role, targetRole: Role): boolean {
  if (actor === 'root') return true;
  if (actor === 'admin') return targetRole === 'user' || targetRole === 'admin';
  return false;
}