/**
 * DSH Hub · 控制面 HTTP API（M1）
 *
 * 零依赖 node:http 单进程服务。路由：
 *   /api/auth/setup|register|login|logout
 *   /api/me               — 自己的信息 + 配额
 *   /api/me/tokens[...]    — API token 双轨（Bearer）
 *   /admin/api/users[...]  — 用户管理（admin/root）
 *   /admin/api/audit       — 审计（admin/root）
 *   /admin/api/settings    — 全局设置（admin/root）
 *   /healthz
 *
 * 鉴权：会话 cookie（HttpOnly + SameSite=Lax + 滑动 7 天）或 Bearer token。
 * 会话鉴权的写操作叠加双重提交 CSRF（cookie dshhub_csrf + 头 X-CSRF-Token）；
 * Bearer 鉴权免 CSRF（无 cookie 面）。越权一律 403；未知一律 404（不泄露存在性）。
 */
import http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { audit } from './db.ts';
import { hashPassword, verifyPassword } from './pwd.ts';
import { canManage, generateSlug, isRole, sanitizeNickname, shortId, type Role, type UserRow } from './users.ts';
import {
  CSRF_COOKIE, SESSION_COOKIE, createApiToken, createSession, destroySession,
  listApiTokens, resolveApiToken, revokeApiToken, validateSession,
} from './sessions.ts';

// ---------- 小工具 ----------

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

function sendError(res: http.ServerResponse, err: unknown): void {
  if (err instanceof HttpError) {
    sendJson(res, err.status, { error: { code: err.code, message: err.message } });
    return;
  }
  console.error('[dsh-hub] unhandled:', err);
  sendJson(res, 500, { error: { code: 'internal', message: 'internal error' } });
}

/** 读取并解析 JSON body（上限 1MiB；Content-Type 非 JSON 也尝试解析，宽松处理）。 */
function readJson(req: http.IncomingMessage, maxBytes = 1024 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new HttpError(413, 'payload_too_large', 'request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return; }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'bad_json', 'request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req: http.IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}

/** 会话 cookie 的 Set-Cookie 值。Secure 仅当 DSH_HUB_COOKIE_SECURE=1（Caddy 后）。 */
function sessionCookiePairs(token: string, csrf: string): string[] {
  const secure = process.env.DSH_HUB_COOKIE_SECURE === '1' ? '; Secure' : '';
  return [
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}${secure}`,
    `${CSRF_COOKIE}=${csrf}; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}${secure}`,
  ];
}

function clearSessionCookies(): string[] {
  return [
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    `${CSRF_COOKIE}=; SameSite=Lax; Path=/; Max-Age=0`,
  ];
}

function clientIp(req: http.IncomingMessage): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return (fwd.split(',')[0] ?? '').trim();
  return req.socket.remoteAddress ?? null;
}

// ---------- 鉴权上下文 ----------

interface AuthCtx {
  userId: number;
  /** 经由会话 cookie 鉴权（需要 CSRF）；Bearer 为 false。 */
  viaSession: boolean;
}

/** 解析请求鉴权：优先 Bearer，其次会话。 */
function resolveAuth(db: DatabaseSync, req: http.IncomingMessage): AuthCtx | null {
  const bearer = req.headers.authorization;
  if (typeof bearer === 'string' && bearer.startsWith('Bearer ')) {
    const uid = resolveApiToken(db, bearer.slice(7).trim());
    return uid ? { userId: uid, viaSession: false } : null;
  }
  const cookies = parseCookies(req);
  const session = validateSession(db, cookies[SESSION_COOKIE]);
  return session ? { userId: session.userId, viaSession: true } : null;
}

/** 写操作 CSRF 校验（仅会话鉴权需要；Bearer 免）。 */
function assertCsrf(req: http.IncomingMessage, cookies: Record<string, string>): void {
  const expected = cookies[CSRF_COOKIE];
  const got = req.headers['x-csrf-token'];
  if (!expected || typeof got !== 'string' || got !== expected) {
    throw new HttpError(403, 'csrf_failed', 'CSRF token mismatch');
  }
}

function getUser(db: DatabaseSync, id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

function getUserByNickname(db: DatabaseSync, nickname: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE nickname = ?').get(nickname) as UserRow | undefined;
}

/** 返回给浏览器的安全用户对象（绝不含 password_hash）。 */
function publicUser(u: UserRow): Record<string, unknown> {
  return {
    id: u.id, nickname: u.nickname, slug: u.slug, dir_name: u.dir_name, email: u.email,
    role: u.role, status: u.status, max_instances: u.max_instances, max_running: u.max_running,
    created_at: u.created_at, last_login_at: u.last_login_at,
  };
}

function requireRole(actor: UserRow, permitted: readonly Role[]): void {
  if (!permitted.includes(actor.role)) throw new HttpError(403, 'forbidden', 'insufficient role');
}

// ---------- 业务 ----------

function getSetting(db: DatabaseSync, key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

const DEFAULT_MAX_INSTANCES = 3;
const DEFAULT_MAX_RUNNING = 1;

/** 建号核心：净化昵称 → slug → dir_name → 落库。事务由调用方决定。 */
function createUserRow(db: DatabaseSync, opts: {
  nickname: string; password: string; role: Role; email?: string | null;
  maxInstances?: number; maxRunning?: number;
}): UserRow {
  const nickname = sanitizeNickname(opts.nickname);
  const slug = generateSlug(nickname, (s) => Boolean(db.prepare('SELECT 1 FROM users WHERE slug = ?').get(s)));
  const dirTaken = (d: string): boolean => Boolean(db.prepare('SELECT 1 FROM users WHERE dir_name = ?').get(d));
  let dirName = sanitizeNickname(nickname, () => `user-${shortId(8)}`);
  let i = 2;
  while (dirTaken(dirName)) dirName = `${dirName}-${i++}`;
  const id = db.prepare(
    'INSERT INTO users (nickname, slug, dir_name, email, password_hash, role, status, max_instances, max_running, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(nickname, slug, dirName, opts.email ?? null, hashPassword(opts.password), opts.role, 'active',
    opts.maxInstances ?? DEFAULT_MAX_INSTANCES, opts.maxRunning ?? DEFAULT_MAX_RUNNING, Date.now()).lastInsertRowid as number;
  const created = getUser(db, id);
  if (!created) throw new HttpError(500, 'internal', 'user insertion failed');
  return created;
}

// 登录限速：Map<nickname, {fails, lastFail, lockUntil}>（进程内；重启清零，M5 可落库）。
const loginLocks = new Map<string, { fails: number; lastFail: number; lockUntil: number }>();
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

function checkLoginLock(nickname: string): void {
  const lock = loginLocks.get(nickname);
  if (lock && lock.lockUntil > Date.now()) {
    const remainMin = Math.ceil((lock.lockUntil - Date.now()) / 60000);
    throw new HttpError(429, 'login_locked', `too many failed attempts, retry in ~${remainMin} min`);
  }
}

function recordLoginFailure(nickname: string): void {
  const now = Date.now();
  const prev = loginLocks.get(nickname);
  if (!prev || now - prev.lastFail > LOGIN_LOCK_MS) loginLocks.set(nickname, { fails: 1, lastFail: now, lockUntil: 0 });
  else {
    const fails = prev.fails + 1;
    loginLocks.set(nickname, { fails, lastFail: now, lockUntil: fails >= LOGIN_MAX_FAILS ? now + LOGIN_LOCK_MS : 0 });
  }
}

function clearLoginLock(nickname: string): void {
  loginLocks.delete(nickname);
}

// ---------- 路由 ----------

type Handler = (ctx: RouteCtx) => Promise<unknown> | unknown;

interface RouteCtx {
  db: DatabaseSync;
  req: http.IncomingMessage;
  res: http.ServerResponse;
  params: Record<string, string>;
  /** 鉴权上下文（路由内按需 resolveAuth）。 */
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

interface Route {
  method: Method;
  // 形如 /api/auth/login 或 /admin/api/users/:id
  pattern: string;
  segments: string[];
  handler: Handler;
}

function segmentize(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function matchRoute(routes: Route[], method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
  const segs = segmentize(pathname);
  for (const route of routes) {
    if (route.method !== method || route.segments.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      // 行 258 已保证两段长度相等，这里索引必然存在
      const p = route.segments[i]!;
      const s = segs[i]!;
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(s);
      else if (p !== s) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

const routes: Route[] = [];

function route(method: Method, pattern: string, handler: Handler): void {
  routes.push({ method, pattern, segments: segmentize(pattern), handler });
}

// ---------- 处理器（handler 返回 void/未知即可；异常由外层 sendError） ----------

interface SetupBody { nickname?: unknown; password?: unknown; email?: unknown }

route('POST', '/api/auth/setup', async ({ db, req, res }) => {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  if (count > 0) throw new HttpError(403, 'setup_closed', 'setup is only available when no user exists');
  const body = await readJson(req) as SetupBody;
  if (typeof body.nickname !== 'string' || typeof body.password !== 'string') {
    throw new HttpError(400, 'invalid_body', 'nickname and password are required');
  }
  if (body.password.length < 8) throw new HttpError(400, 'weak_password', 'password must be at least 8 characters');
  let user: UserRow;
  try {
    user = createUserRow(db, { nickname: body.nickname, password: body.password, role: 'admin', email: typeof body.email === 'string' ? body.email : null });
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'nickname_taken', 'nickname already taken');
    throw e;
  }
  audit(db, 'setup', user.id, user.id, `setup created admin ${user.nickname} (slug=${user.slug})`);
  // setup 是首个入口，直接建会话进入（cookie 写入响应）
  const { token, csrf } = createSession(db, user.id, null, null);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
  res.setHeader('set-cookie', sessionCookiePairs(token, csrf));
  const fresh = getUser(db, user.id);
  return { user: publicUser(fresh ?? user) };
});

route('POST', '/api/auth/register', async ({ db, req, res }) => {
  if (getSetting(db, 'registration_open', 'closed') !== 'open') {
    throw new HttpError(403, 'registration_closed', 'registration is closed');
  }
  const body = await readJson(req) as SetupBody;
  if (typeof body.nickname !== 'string' || typeof body.password !== 'string') {
    throw new HttpError(400, 'invalid_body', 'nickname and password are required');
  }
  if (body.password.length < 8) throw new HttpError(400, 'weak_password', 'password must be at least 8 characters');
  const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  const role: Role = count === 0 ? 'root' : 'user'; // 第一个注册的普通账号自动 root 兜底（两者只生效其一）
  let user: UserRow;
  try {
    user = createUserRow(db, { nickname: body.nickname, password: body.password, role, email: typeof body.email === 'string' ? body.email : null });
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'nickname_taken', 'nickname already taken');
    throw e;
  }
  audit(db, 'register', user.id, user.id, `registered as ${role} (slug=${user.slug})`);
  const { token, csrf } = createSession(db, user.id, null, null);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
  res.setHeader('set-cookie', sessionCookiePairs(token, csrf));
  const fresh = getUser(db, user.id);
  return { user: publicUser(fresh ?? user) };
});

route('POST', '/api/auth/login', async ({ db, req, res }) => {
  const body = await readJson(req) as { nickname?: unknown; password?: unknown };
  if (typeof body.nickname !== 'string' || typeof body.password !== 'string') {
    throw new HttpError(400, 'invalid_body', 'nickname and password are required');
  }
  const nickname = sanitizeNickname(body.nickname);
  checkLoginLock(nickname);
  const user = getUserByNickname(db, nickname);
  if (!user || !verifyPassword(body.password, user.password_hash)) {
    recordLoginFailure(nickname);
    audit(db, 'login_failed', null, user?.id ?? null, `nickname=${nickname} ip=${clientIp(req)}`);
    throw new HttpError(401, 'bad_credentials', 'invalid nickname or password');
  }
  if (user.status === 'disabled') throw new HttpError(403, 'disabled', 'account disabled');
  clearLoginLock(nickname);
  const { token, csrf } = createSession(db, user.id, clientIp(req), req.headers['user-agent'] ?? null);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
  audit(db, 'login', user.id, user.id, `ip=${clientIp(req)}`);
  res.setHeader('set-cookie', sessionCookiePairs(token, csrf));
  return { user: publicUser(user) };
});

route('POST', '/api/auth/logout', async ({ db, req, res }) => {
  const cookies = parseCookies(req);
  destroySession(db, cookies[SESSION_COOKIE]);
  audit(db, 'logout', null, null);
  res.setHeader('set-cookie', clearSessionCookies());
  return { ok: true };
});

route('GET', '/api/me', async ({ db, req }) => {
  const auth = resolveAuth(db, req);
  if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
  const user = getUser(db, auth.userId);
  if (!user || user.status === 'disabled') throw new HttpError(401, 'unauthorized', 'account unavailable');
  return { user: publicUser(user) };
});

route('POST', '/api/me/tokens', async ({ db, req }) => {
  const auth = resolveAuth(db, req);
  if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
  const cookies = parseCookies(req);
  if (auth.viaSession) assertCsrf(req, cookies);
  const body = await readJson(req) as { name?: unknown };
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 64) : 'default';
  const { id, token } = createApiToken(db, auth.userId, name);
  audit(db, 'token_issue', auth.userId, auth.userId, `token #${id} name=${name}`);
  return { id, token }; // token 仅此一次明文返回
});

route('GET', '/api/me/tokens', async ({ db, req }) => {
  const auth = resolveAuth(db, req);
  if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
  return { tokens: listApiTokens(db, auth.userId) };
});

route('POST', '/api/me/tokens/:id/revoke', async ({ db, req }) => {
  const auth = resolveAuth(db, req);
  if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
  const cookies = parseCookies(req);
  if (auth.viaSession) assertCsrf(req, cookies);
  const id = Number(req.params?.id ?? '');
  if (!Number.isInteger(id)) throw new HttpError(400, 'invalid_id', 'bad token id');
  if (!revokeApiToken(db, auth.userId, id)) throw new HttpError(404, 'not_found', 'token not found');
  audit(db, 'token_revoke', auth.userId, auth.userId, `token #${id}`);
  return { ok: true };
});

// ---------- 管理面（admin/root） ----------

route('GET', '/admin/api/users', async ({ db, req }) => {
  const auth = resolveAuth(db, req);
  if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
  const actor = getUser(db, auth.userId);
  if (!actor) throw new HttpError(401, 'unauthorized', 'account unavailable');
  requireRole(actor, ['admin', 'root']);
  const rows = db.prepare('SELECT id, nickname, slug, dir_name, email, role, status, max_instances, max_running, created_at, last_login_at FROM users ORDER BY id').all() as Omit<UserRow, 'password_hash'>[];
  return { users: rows };
});

interface AdminCreateBody { nickname?: unknown; password?: unknown; role?: unknown; email?: unknown; max_instances?: unknown; max_running?: unknown }

route('POST', '/admin/api/users', async ({ db, req }) => {
  const auth = resolveAuth(db, req);
  if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
  const actor = getUser(db, auth.userId);
  if (!actor) throw new HttpError(401, 'unauthorized', 'account unavailable');
  requireRole(actor, ['admin', 'root']);
  const cookies = parseCookies(req);
  if (auth.viaSession) assertCsrf(req, cookies);
  const body = await readJson(req) as AdminCreateBody;
  if (typeof body.nickname !== 'string' || typeof body.password !== 'string') {
    throw new HttpError(400, 'invalid_body', 'nickname and password are required');
  }
  if (body.password.length < 8) throw new HttpError(400, 'weak_password', 'password must be at least 8 characters');
  const role: Role = typeof body.role === 'string' && isRole(body.role) ? body.role : 'user';
  if (!canManage(actor.role, role)) throw new HttpError(403, 'forbidden', 'cannot create that role');
  let user: UserRow;
  try {
    user = createUserRow(db, {
      nickname: body.nickname, password: body.password, role,
      email: typeof body.email === 'string' ? body.email : null,
      maxInstances: typeof body.max_instances === 'number' ? body.max_instances : undefined,
      maxRunning: typeof body.max_running === 'number' ? body.max_running : undefined,
    });
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'nickname_taken', 'nickname (or slug/email) already taken');
    throw e;
  }
  audit(db, 'user_create', actor.id, user.id, `created ${role} ${user.nickname} (slug=${user.slug})`);
  return { user: publicUser(user) };
});

route('GET', '/admin/api/users/:id', async ({ db, req }) => {
  const auth = resolveAuth(db, req);
  if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
  const actor = getUser(db, auth.userId);
  if (!actor) throw new HttpError(401, 'unauthorized', 'account unavailable');
  requireRole(actor, ['admin', 'root']);
  const id = Number(req.params?.id ?? '');
  if (!Number.isInteger(id)) throw new HttpError(400, 'invalid_id', 'bad user id');
  const user = getUser(db, id);
  if (!user) throw new HttpError(404, 'not_found', 'user not found');
  if (!canManage(actor.role, user.role)) throw new HttpError(403, 'forbidden', 'cannot manage that role');
  return { user: publicUser(user) };
});

interface AdminPatchBody { status?: unknown; role?: unknown; password?: unknown; max_instances?: unknown; max_running?: unknown }

route('PATCH', '/admin/api/users/:id', async ({ db, req }) => {
  const auth = resolveAuth(db, req);
  if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
  const actor = getUser(db, auth.userId);
  if (!actor) throw new HttpError(401, 'unauthorized', 'account unavailable');
  requireRole(actor, ['admin', 'root']);
  const cookies = parseCookies(req);
  if (auth.viaSession) assertCsrf(req, cookies);
  const id = Number(req.params?.id ?? '');
  if (!Number.isInteger(id)) throw new HttpError(400, 'invalid_id', 'bad user id');
  const target = getUser(db, id);
  if (!target) throw new HttpError(404, 'not_found', 'user not found');
  if (!canManage(actor.role, target.role)) throw new HttpError(403, 'forbidden', 'cannot manage that role');
  const body = await readJson(req) as AdminPatchBody;
  const changes: string[] = [];
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'disabled') throw new HttpError(400, 'invalid_status', 'status must be active|disabled');
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(body.status, id);
    changes.push(`status=${body.status}`);
    audit(db, body.status === 'disabled' ? 'user_disable' : 'user_enable', actor.id, id, `by ${actor.nickname}`);
  }
  if (body.role !== undefined) {
    if (!isRole(body.role)) throw new HttpError(400, 'invalid_role', 'role must be user|admin|root');
    if (!canManage(actor.role, body.role)) throw new HttpError(403, 'forbidden', 'cannot grant that role');
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, id);
    changes.push(`role=${body.role}`);
  }
  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < 8) throw new HttpError(400, 'weak_password', 'password must be at least 8 characters');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), id);
    // 重置密码即吊销全部会话，防旧会话复用
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    changes.push('password reset (sessions revoked)');
    audit(db, 'password_reset', actor.id, id, `by ${actor.nickname}`);
  }
  for (const [key, value] of [['max_instances', body.max_instances], ['max_running', body.max_running]] as const) {
    if (value !== undefined) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new HttpError(400, 'invalid_quota', `${key} must be a non-negative integer`);
      db.prepare(`UPDATE users SET ${key} = ? WHERE id = ?`).run(value, id);
      changes.push(`${key}=${value}`);
    }
  }
  if (changes.length === 0) throw new HttpError(400, 'no_changes', 'nothing to update');
  audit(db, 'user_update', actor.id, id, `by ${actor.nickname}: ${changes.join(', ')}`);
  const updated = getUser(db, id);
  if (!updated) throw new HttpError(500, 'internal', 'user fetch failed');
  return { user: publicUser(updated) };
});

route('GET', '/admin/api/audit', async ({ db, req }) => {
  const auth = resolveAuth(db, req);
  if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
  const actor = getUser(db, auth.userId);
  if (!actor) throw new HttpError(401, 'unauthorized', 'account unavailable');
  requireRole(actor, ['admin', 'root']);
  const url = new URL(req.url ?? '/', 'http://dsh-hub.invalid');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200) || 200, 1000);
  const rows = db.prepare('SELECT id, actor_id, target_user_id, action, detail, created_at FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit);
  return { audit: rows };
});

route('GET', '/admin/api/settings', async ({ db, req }) => {
  const auth = resolveAuth(db, req);
  if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
  const actor = getUser(db, auth.userId);
  if (!actor) throw new HttpError(401, 'unauthorized', 'account unavailable');
  requireRole(actor, ['admin', 'root']);
  const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return { settings: map };
});

route('PUT', '/admin/api/settings', async ({ db, req }) => {
  const auth = resolveAuth(db, req);
  if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
  const actor = getUser(db, auth.userId);
  if (!actor) throw new HttpError(401, 'unauthorized', 'account unavailable');
  requireRole(actor, ['admin', 'root']);
  const cookies = parseCookies(req);
  if (auth.viaSession) assertCsrf(req, cookies);
  const body = await readJson(req) as Record<string, unknown>;
  const ALLOWED = new Set(['registration_open', 'default_harness_version', 'route_mode', 'credential_mode']);
  const allowed: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED.has(key)) throw new HttpError(400, 'invalid_key', `unknown setting key: ${key}`);
    if (key === 'registration_open' && value !== 'open' && value !== 'closed') throw new HttpError(400, 'invalid_value', 'registration_open must be open|closed');
    if (typeof value !== 'string') throw new HttpError(400, 'invalid_value', `${key} must be a string`);
    allowed[key] = value;
  }
  for (const [key, value] of Object.entries(allowed)) setSetting(db, key, value);
  audit(db, 'user_update', actor.id, null, `settings updated by ${actor.nickname}: ${Object.keys(allowed).join(', ')}`);
  return { settings: allowed };
});

route('GET', '/healthz', async () => ({ ok: true, ts: Date.now() }));

// ---------- 服务装配 ----------

export interface ServerOptions {
  host?: string;
  port?: number;
}

export function startServer(db: DatabaseSync, opts: ServerOptions = {}): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://dsh-hub.invalid');
      const method = (req.method ?? 'GET').toUpperCase();
      const match = matchRoute(routes, method, url.pathname);
      // 未知路径一律 404（管理面路径与实例流量分离；M3 才接入反代）
      if (!match) {
        sendJson(res, 404, { error: { code: 'not_found', message: 'not found' } });
        return;
      }
      const { route: matched, params } = match;
      req.params = params;
      const result = await matched.handler({ db, req, res, params });
      if (res.headersSent) return;
      // handler 若已 setHeader('set-cookie')（登录等建会话），sendJson 的 writeHead 会合并保留。
      sendJson(res, 200, result ?? { ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });
  server.listen(opts.port ?? 3082, opts.host ?? '127.0.0.1');
  return server;
}

// TS 扩展：在 IncomingMessage 上挂 params
declare module 'node:http' {
  interface IncomingMessage {
    params?: Record<string, string>;
  }
}