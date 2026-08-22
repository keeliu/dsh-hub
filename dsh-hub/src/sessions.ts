/**
 * DSH Hub · 会话与 API token（M1）
 *
 * - 浏览器会话：cookie 存 32 字节随机 token（64 hex）；DB 只存 SHA-256(token)。
 *   滑动过期 7 天（每次校验命中后顺延）。HttpOnly + SameSite=Lax。
 * - API token：Bearer 双轨（sub2api 式），DB 只存哈希，可吊销。
 */
import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 滑动过期 7 天

export const SESSION_COOKIE = 'dshhub_sid';
export const CSRF_COOKIE = 'dshhub_csrf';
export const TOKEN_PREFIX = 'dsh_';

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export interface SessionInfo {
  userId: number;
  expiresAt: number;
}

export interface CreateSessionResult {
  token: string;
  csrf: string;
}

export function createSession(db: DatabaseSync, userId: number, ip: string | null, ua: string | null): CreateSessionResult {
  const token = newSessionToken();
  const csrf = randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at, ip, ua) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sha256Hex(token), userId, expiresAt, Date.now(), ip ?? null, ua ?? null);
  return { token, csrf };
}

/** 校验会话；命中则滑动续期。返回 null 表示无效/过期。 */
export function validateSession(db: DatabaseSync, cookie: string | undefined): SessionInfo | null {
  if (!cookie) return null;
  const hash = sha256Hex(cookie);
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(hash) as
    | { user_id: number; expires_at: number }
    | undefined;
  if (!row) return null;
  const now = Date.now();
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
    return null;
  }
  const next = now + SESSION_TTL_MS;
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(next, hash);
  return { userId: row.user_id, expiresAt: next };
}

export function destroySession(db: DatabaseSync, cookie: string | undefined): void {
  if (!cookie) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256Hex(cookie));
}

// ---- API token ----

export interface ApiTokenRow {
  id: number;
  name: string;
  created_at: number;
  revoked_at: number | null;
}

export function createApiToken(db: DatabaseSync, userId: number, name: string): { id: number; token: string } {
  const token = TOKEN_PREFIX + randomBytes(24).toString('hex');
  const id = db.prepare('INSERT INTO api_tokens (user_id, name, token_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, name, sha256Hex(token), Date.now()).lastInsertRowid as number;
  return { id, token };
}

export function listApiTokens(db: DatabaseSync, userId: number): ApiTokenRow[] {
  return db.prepare('SELECT id, name, created_at, revoked_at FROM api_tokens WHERE user_id = ? ORDER BY id')
    .all(userId) as unknown as ApiTokenRow[];
}

/** 用 Bearer token 换取用户 id（未吊销才有效）。 */
export function resolveApiToken(db: DatabaseSync, token: string | undefined): number | null {
  if (!token) return null;
  if (token.startsWith(TOKEN_PREFIX)) {
    const row = db.prepare('SELECT user_id FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL')
      .get(sha256Hex(token)) as { user_id: number } | undefined;
    return row ? row.user_id : null;
  }
  return null;
}

export function revokeApiToken(db: DatabaseSync, userId: number, tokenId: number): boolean {
  const res = db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ?')
    .run(Date.now(), tokenId, userId);
  return res.changes > 0;
}