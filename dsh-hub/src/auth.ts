/**
 * DSH Hub · 鉴权与访问控制（M2.1 拆分）
 *
 * - authenticate：Bearer/会话 → UserRow，强制校验 status=active（修复「禁用账号
 *   会话仍有效、可自解封」高危缺陷：所有受保护路由共用此入口）。
 * - assertCsrf：双重提交 CSRF（timingSafeEqual 比较，M2.1）。
 * - 登录限速：键 = `${ip}|${nickname}`（防跨 IP 绕过与针对昵称的锁死 DoS）；
 *   锁过期后计数归零（防「每 15 分钟补一次失败永久锁号」）。
 */
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { HttpError, parseCookies } from './http.ts';
import { CSRF_COOKIE, createSession, resolveApiToken, SESSION_COOKIE, validateSession } from './sessions.ts';
import { getUser, getUserByAccount, type Role, type UserRow } from './users.ts';
import { verifyPassword, DUMMY_HASH } from './pwd.ts';
import { audit } from './db.ts';

export interface AuthResult {
  user: UserRow;
  /** 经由会话 cookie 鉴权（需要 CSRF）；Bearer 为 false。 */
  viaSession: boolean;
}

/** 解析请求鉴权：优先 Bearer，其次会话。用户不存在或被禁用一律视为未鉴权（M2.1）。 */
export function authenticate(db: DatabaseSync, req: IncomingMessage): AuthResult | null {
  const bearer = req.headers.authorization;
  if (typeof bearer === 'string' && bearer.startsWith('Bearer ')) {
    const uid = resolveApiToken(db, bearer.slice(7).trim());
    if (uid === null) return null;
    const user = getUser(db, uid);
    if (!user || user.status === 'disabled') return null;
    return { user, viaSession: false };
  }
  const cookies = parseCookies(req);
  const session = validateSession(db, cookies[SESSION_COOKIE]);
  if (!session) return null;
  const user = getUser(db, session.userId);
  if (!user || user.status === 'disabled') return null;
  return { user, viaSession: true };
}

/** 写操作 CSRF 校验（仅会话鉴权需要；Bearer 免）。 */
export function assertCsrf(req: IncomingMessage, cookies: Record<string, string>): void {
  const expected = cookies[CSRF_COOKIE];
  const got = req.headers['x-csrf-token'];
  if (!expected || typeof got !== 'string') throw new HttpError(403, 'csrf_failed', 'CSRF token mismatch');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(got, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(403, 'csrf_failed', 'CSRF token mismatch');
  }
}

export function requireRole(user: UserRow, permitted: readonly Role[]): void {
  if (!permitted.includes(user.role)) throw new HttpError(403, 'forbidden', 'insufficient role');
}

// ---------- 登录限速（进程内；重启清零，M5 可落库） ----------

interface LockEntry { fails: number; lastFail: number; lockUntil: number }

const loginLocks = new Map<string, LockEntry>();
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

/** 限速键：IP + 昵称双维度（M2.1），防止单 IP 爆破与「锁死指定昵称」两种滥用。 */
export function loginLockKey(ip: string | null, nickname: string): string {
  return `${ip ?? '?'}|${nickname}`;
}

export function checkLoginLock(key: string): void {
  const lock = loginLocks.get(key);
  if (lock && lock.lockUntil > Date.now()) {
    const remainMin = Math.ceil((lock.lockUntil - Date.now()) / 60000);
    throw new HttpError(429, 'login_locked', `too many failed attempts, retry in ~${remainMin} min`);
  }
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const prev = loginLocks.get(key);
  // 锁已过期 → 归零重计（M2.1：此前失败计数延续，攻击者可每 15 分钟补一次失败无限续锁）
  if (!prev) loginLocks.set(key, { fails: 1, lastFail: now, lockUntil: 0 });
  else if (prev.lockUntil > 0 && prev.lockUntil <= now) loginLocks.set(key, { fails: 1, lastFail: now, lockUntil: 0 });
  else if (now - prev.lastFail > LOGIN_LOCK_MS) loginLocks.set(key, { fails: 1, lastFail: now, lockUntil: 0 });
  else {
    const fails = prev.fails + 1;
    loginLocks.set(key, { fails, lastFail: now, lockUntil: fails >= LOGIN_MAX_FAILS ? now + LOGIN_LOCK_MS : 0 });
  }
}

export function clearLoginLock(key: string): void {
  loginLocks.delete(key);
}

// ---------- 登录统一入口 ----------

export interface LoginResult {
  user: UserRow;
  token: string;
  csrf: string;
}

/** 统一登录逻辑（pages/api 共享），处理限速、密码校验、会话创建、审计。 */
export function attemptLogin(
  db: DatabaseSync,
  account: string,
  password: string,
  ip: string | null,
  ua: string | null
): LoginResult {
  const key = loginLockKey(ip, account);
  checkLoginLock(key);

  const user = getUserByAccount(db, account);
  let valid = false;
  if (user) valid = verifyPassword(password, user.password_hash);
  else verifyPassword(password, DUMMY_HASH);

  if (!user || !valid) {
    recordLoginFailure(key);
    audit(db, 'login_failed', null, user?.id ?? null, `account=${account} ip=${ip}`);
    throw new HttpError(401, 'bad_credentials', 'invalid account or password');
  }
  if (user.status === 'disabled') throw new HttpError(403, 'disabled', 'account disabled');

  clearLoginLock(key);
  const session = createSession(db, user.id, ip, ua);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
  audit(db, 'login', user.id, user.id, `ip=${ip}`);

  return { user, ...session };
}
