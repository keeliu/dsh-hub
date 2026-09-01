/**
 * DSH Hub · 控制面 HTTP API（M1；M2.1 安全重构）
 *
 * 零依赖 node:http 单进程服务。路由：
 *   /api/auth/setup|register|login|logout
 *   /api/me               — 自己的信息 + 配额
 *   /api/me/tokens[...]    — API token 双轨（Bearer）
 *   /admin/api/users[...]  — 用户管理（admin/root）
 *   /admin/api/audit       — 审计（admin/root）
 *   /admin/api/settings    — 全局设置（admin/root）
 *   /api/instances[...]    — 实例（M2）
 *   /healthz
 *
 * M2.1 重构要点：
 * - 路由声明式选项 { auth, csrf }：鉴权与 CSRF 由服务层统一执行（此前每个
 *   handler 重复 resolveAuth+getUser+CSRF 三连）；auth 路由强制 status=active
 *   （修复「禁用账号会话仍有效、可自解封」高危缺陷，配套见 PATCH users）。
 * - 封禁 = 停全部实例 + 吊销会话与 API token（落实计划 §3.6「禁用即杀实例」）。
 * - harness_version 白名单校验 + default_harness_version 生效（修复 RCE 注入）。
 * - 登录限速键 = IP+昵称；用户不存在时执行 dummy scrypt（消除时间侧信道）。
 * - 实例写操作 per-instance 互斥（409 instance_busy），配合 supervisor 锁 token。
 * - setup/register/建用户/改用户事务化（BEGIN IMMEDIATE）。
 *
 * 鉴权：会话 cookie（HttpOnly + SameSite=Lax + 滑动 7 天、绝对上限 30 天）
 * 或 Bearer token。会话鉴权的写操作叠加双重提交 CSRF（cookie + X-CSRF-Token）；
 * Bearer 鉴权免 CSRF。越权一律 403；未知一律 404（不泄露存在性）。
 */
import http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { audit, withTx } from './db.ts';
import { handlePageRequest } from './pages.ts';
import { handleGatewayRequest, handleGatewayWebSocket, proxyToDshInstance, proxyWebSocketToDshInstance } from './gateway.ts';
import { config } from './config.ts';
import { getXunhupayConfig, createPayment, verifyHash, type NotifyParams } from './payment.ts';
import { HttpError, clientIp, parseCookies, readForm, readJson, sendError, sendJson } from './http.ts';
import {
  authenticate, assertCsrf, checkLoginLock, clearLoginLock, loginLockKey, recordLoginFailure, requireRole,
} from './auth.ts';
import { getSetting, getSettingsMap, setSetting, SETTING_KEYS } from './settings.ts';
import { parseAllowedVersions, isValidHarnessVersion, versionAllowed } from './version.ts';
import { hashPassword, verifyPassword, DUMMY_HASH } from './pwd.ts';
import { canManage, generateSlug, getUser, getUserByAccount, getUserByEmail, getUserByNickname, getUserByUsername, isRole, isValidEmail, isValidUsername, sanitizeNickname, shortId, type Role, type UserRow } from './users.ts';
import { createInstance, deleteInstance, getInstance, listAllInstances, listInstances, listRunningInstances, runningCount } from './instances.ts';
import { startInstance, stopInstance, tailLog, type InstanceRecord } from './supervisor/index.ts';
import { getUserMembership, getUserOrders, getAllOrders, createOrder, getOrderById, handlePaymentCallback, MEMBERSHIP_CONFIG, type MembershipType } from './membership.ts';
import {
  CSRF_COOKIE, SESSION_COOKIE, createApiToken, createSession, destroySession,
  listApiTokens, revokeApiToken,
} from './sessions.ts';
import { createResetCode, sendResetCodeEmail, verifyResetCode } from './email.ts';

// ---------- 小工具 ----------

function publicUser(u: UserRow): Record<string, unknown> {
  return {
    id: u.id, nickname: u.nickname, slug: u.slug, dir_name: u.dir_name, email: u.email,
    role: u.role, status: u.status, max_instances: u.max_instances, max_running: u.max_running,
    created_at: u.created_at, last_login_at: u.last_login_at,
  };
}

/** 会话 cookie 的 Set-Cookie 值。Secure 仅当 DSH_HUB_COOKIE_SECURE=1（Caddy 后）。 */
function sessionCookiePairs(token: string, csrf: string): string[] {
  const secure = config.cookieSecure ? '; Secure' : '';
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

/** 非负整数配额校验（建号/PATCH 共用，M2.1 对齐并加上界）。 */
function validQuota(v: number): boolean {
  return Number.isInteger(v) && v >= 0 && v <= 1000;
}

/** 查询参数整数规范化（负数/非数字回退默认值，M2.1）。 */
function clampInt(raw: string | null, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

// ---------- 业务 ----------

const DEFAULT_MAX_INSTANCES = 3;
const DEFAULT_MAX_RUNNING = 1;

/** 建号核心：净化昵称 → slug → dir_name → 落库。事务由调用方决定（M2.1）。 */
function createUserRow(db: DatabaseSync, opts: {
  nickname: string; password: string; role: Role; email?: string | null; username?: string | null;
  maxInstances?: number; maxRunning?: number;
}): UserRow {
  // M2.1：昵称净化后为空 → 400（此前回退随机名，用户将永远无法登录）
  const nickname = sanitizeNickname(opts.nickname, () => '');
  if (nickname === '') throw new HttpError(400, 'invalid_nickname', 'nickname must contain visible characters');
  const maxInstances = opts.maxInstances ?? DEFAULT_MAX_INSTANCES;
  const maxRunning = opts.maxRunning ?? DEFAULT_MAX_RUNNING;
  if (!validQuota(maxInstances) || !validQuota(maxRunning)) {
    throw new HttpError(400, 'invalid_quota', 'quota must be an integer in [0, 1000]');
  }
  // 验证 username
  const username = opts.username ?? null;
  if (username && !isValidUsername(username)) {
    throw new HttpError(400, 'invalid_username', 'username must be 3-32 alphanumeric characters or underscores');
  }
  if (username && getUserByUsername(db, username)) {
    throw new HttpError(409, 'username_taken', 'username already taken');
  }
  // 验证 email
  const email = opts.email ?? null;
  if (email && !isValidEmail(email)) {
    throw new HttpError(400, 'invalid_email', 'invalid email format');
  }
  if (email && getUserByEmail(db, email)) {
    throw new HttpError(409, 'email_taken', 'email already registered');
  }
  const slug = generateSlug(nickname, (s) => Boolean(db.prepare('SELECT 1 FROM users WHERE slug = ?').get(s)));
  const dirTaken = (d: string): boolean => Boolean(db.prepare('SELECT 1 FROM users WHERE dir_name = ?').get(d));
  let dirName = sanitizeNickname(nickname, () => `user-${shortId(8)}`);
  let i = 2;
  while (dirTaken(dirName)) dirName = `${dirName}-${i++}`;
  const id = db.prepare(
    'INSERT INTO users (nickname, slug, dir_name, username, email, password_hash, role, status, max_instances, max_running, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(nickname, slug, dirName, username, email, hashPassword(opts.password), opts.role, 'active',
    maxInstances, maxRunning, Date.now()).lastInsertRowid as number;
  const created = getUser(db, id);
  if (!created) throw new HttpError(500, 'internal', 'user insertion failed');
  return created;
}

// ---------- 路由 ----------

type Handler = (ctx: RouteCtx) => Promise<unknown> | unknown;

interface RouteCtx {
  db: DatabaseSync;
  req: http.IncomingMessage;
  res: http.ServerResponse;
  params: Record<string, string>;
  /** 已鉴权用户（仅 auth 路由；非 auth 路由不使用）。 */
  user: UserRow;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

interface RouteOpts {
  /** 需要登录（服务层统一鉴权并校验 status=active）。 */
  auth?: boolean;
  /** 写操作 CSRF（仅会话鉴权生效；Bearer 免）。 */
  csrf?: boolean;
}

interface Route {
  method: Method;
  pattern: string;
  segments: string[];
  handler: Handler;
  auth: boolean;
  csrf: boolean;
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
      const p = route.segments[i]!;
      const s = segs[i]!;
      if (p.startsWith(':')) {
        // M2.1：畸形百分号编码 → 400（此前 URIError → 500）
        let v: string;
        try { v = decodeURIComponent(s); } catch {
          throw new HttpError(400, 'bad_path', 'malformed percent-encoding in path');
        }
        params[p.slice(1)] = v;
      } else if (p !== s) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

const routes: Route[] = [];

function route(method: Method, pattern: string, handler: Handler): void;
function route(method: Method, pattern: string, opts: RouteOpts, handler: Handler): void;
function route(method: Method, pattern: string, a: Handler | RouteOpts, b?: Handler): void {
  const handler = typeof a === 'function' ? a : b!;
  const opts = typeof a === 'function' ? {} : a;
  routes.push({ method, pattern, segments: segmentize(pattern), handler, auth: opts.auth ?? false, csrf: opts.csrf ?? false });
}

// ---------- 处理器 ----------

interface SetupBody { nickname?: unknown; password?: unknown; email?: unknown; username?: unknown }

// 首启向导：无用户时可建管理员（事务化，M2.1 消除并发双管理员竞态）
route('POST', '/api/auth/setup', async ({ db, req, res }) => {
  const body = await readJson(req) as SetupBody;
  if (typeof body.nickname !== 'string' || typeof body.password !== 'string') {
    throw new HttpError(400, 'invalid_body', 'nickname and password are required');
  }
  if (body.password.length < 8) throw new HttpError(400, 'weak_password', 'password must be at least 8 characters');
  // 提取局部（withTx 回调内 TS 不保留属性访问的收窄）
  const nickname = body.nickname;
  const password = body.password;
  const email = typeof body.email === 'string' ? body.email : null;
  let user: UserRow;
  try {
    user = withTx(db, () => {
      const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
      if (count > 0) throw new HttpError(403, 'setup_closed', 'setup is only available when no user exists');
      return createUserRow(db, { nickname, password, role: 'admin', email });
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
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
  // M2.1：注册限速（IP 维度，防开放注册时批量建号）
  const regKey = loginLockKey(clientIp(req), 'register');
  checkLoginLock(regKey);
  const nickname = body.nickname;
  const password = body.password;
  const email = typeof body.email === 'string' ? body.email : null;
  const username = typeof body.username === 'string' ? body.username : null;
  let user: UserRow;
  try {
    user = withTx(db, () => {
      const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
      const role: Role = count === 0 ? 'root' : 'user'; // 第一个注册的普通账号自动 root 兜底
      return createUserRow(db, { nickname, password, role, email, username });
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'nickname_taken', 'nickname already taken');
    throw e;
  }
  clearLoginLock(regKey);
  audit(db, 'register', user.id, user.id, `registered as ${user.role} (slug=${user.slug})`);
  const { token, csrf } = createSession(db, user.id, null, null);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
  res.setHeader('set-cookie', sessionCookiePairs(token, csrf));
  const fresh = getUser(db, user.id);
  return { user: publicUser(fresh ?? user) };
});

route('POST', '/api/auth/login', async ({ db, req, res }) => {
  const body = await readJson(req) as { account?: unknown; password?: unknown; nickname?: unknown };
  // 支持 account（username/email）或 nickname（向后兼容）
  const account = typeof body.account === 'string' ? body.account : typeof body.nickname === 'string' ? body.nickname : '';
  if (!account || typeof body.password !== 'string') {
    throw new HttpError(400, 'invalid_body', 'account (username/email) and password are required');
  }
  // M2.1：限速键 = IP + 账户（防跨 IP 爆破与针对账户的锁死 DoS）
  const key = loginLockKey(clientIp(req), account);
  checkLoginLock(key);
  const user = getUserByAccount(db, account);
  // M2.1：用户不存在也执行一次同参数 scrypt（消除时间侧信道用户名枚举）
  let valid = false;
  if (user) valid = verifyPassword(body.password, user.password_hash);
  else verifyPassword(body.password, DUMMY_HASH);
  if (!user || !valid) {
    recordLoginFailure(key);
    audit(db, 'login_failed', null, user?.id ?? null, `account=${account} ip=${clientIp(req)}`);
    throw new HttpError(401, 'bad_credentials', 'invalid account or password');
  }
  if (user.status === 'disabled') throw new HttpError(403, 'disabled', 'account disabled');
  clearLoginLock(key);
  const { token, csrf } = createSession(db, user.id, clientIp(req), req.headers['user-agent'] ?? null);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
  audit(db, 'login', user.id, user.id, `ip=${clientIp(req)}`);
  res.setHeader('set-cookie', sessionCookiePairs(token, csrf));
  return { user: publicUser(user) };
});

// 登出：公开（无鉴权）但需 CSRF（与其余写操作一致，M2.1）
route('POST', '/api/auth/logout', { csrf: true }, async ({ db, req, res }) => {
  const cookies = parseCookies(req);
  destroySession(db, cookies[SESSION_COOKIE]);
  audit(db, 'logout', null, null);
  res.setHeader('set-cookie', clearSessionCookies());
  
  // 页面表单提交时重定向到登录页，API 调用返回 JSON
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    res.statusCode = 303;
    res.setHeader('location', '/login');
    res.end();
    return null;
  }
  return { ok: true };
});

// 找回密码：发送验证码
route('POST', '/api/auth/forgot-password', async ({ db, req }) => {
  const body = await readJson(req) as { email?: unknown };
  if (typeof body.email !== 'string' || !body.email) {
    throw new HttpError(400, 'invalid_body', 'email is required');
  }
  const email = body.email.toLowerCase().trim();
  // 检查用户是否存在（但不泄露存在性）
  const user = getUserByEmail(db, email);
  if (user) {
    const code = createResetCode(db, email);
    try {
      await sendResetCodeEmail(email, code);
    } catch (err) {
      console.error('Failed to send reset email:', err);
      // 不抛出错误，避免泄露邮箱是否存在
    }
  }
  // 无论邮箱是否存在，都返回成功（防枚举）
  return { ok: true, message: '如果邮箱已注册，您将收到重置验证码' };
});

// 找回密码：重置密码
route('POST', '/api/auth/reset-password', async ({ db, req }) => {
  const body = await readJson(req) as { email?: unknown; code?: unknown; password?: unknown };
  if (typeof body.email !== 'string' || typeof body.code !== 'string' || typeof body.password !== 'string') {
    throw new HttpError(400, 'invalid_body', 'email, code and password are required');
  }
  if (body.password.length < 8) {
    throw new HttpError(400, 'weak_password', 'password must be at least 8 characters');
  }
  const email = body.email.toLowerCase().trim();
  if (!verifyResetCode(db, email, body.code)) {
    throw new HttpError(400, 'invalid_code', '验证码无效或已过期');
  }
  const user = getUserByEmail(db, email);
  if (!user) {
    throw new HttpError(404, 'not_found', 'user not found');
  }
  const passwordHash = await hashPassword(body.password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
  // 吊销该用户所有会话和 token
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(Date.now(), user.id);
  audit(db, 'password_reset', null, user.id, `email=${email}`);
  return { ok: true, message: '密码已重置，请重新登录' };
});

route('GET', '/api/me', { auth: true }, async ({ user }) => ({ user: publicUser(user) }));

route('POST', '/api/me/tokens', { auth: true, csrf: true }, async ({ db, req, user }) => {
  const body = await readJson(req) as { name?: unknown };
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 64) : 'default';
  const { id, token } = createApiToken(db, user.id, name);
  audit(db, 'token_issue', user.id, user.id, `token #${id} name=${name}`);
  return { id, token }; // token 仅此一次明文返回
});

route('GET', '/api/me/tokens', { auth: true }, async ({ db, user }) => ({ tokens: listApiTokens(db, user.id) }));

route('POST', '/api/me/tokens/:id/revoke', { auth: true, csrf: true }, async ({ db, req, user }) => {
  const id = Number(req.params?.id ?? '');
  if (!Number.isInteger(id)) throw new HttpError(400, 'invalid_id', 'bad token id');
  if (!revokeApiToken(db, user.id, id)) throw new HttpError(404, 'not_found', 'token not found');
  audit(db, 'token_revoke', user.id, user.id, `token #${id}`);
  return { ok: true };
});

// ---------- 管理面（admin/root） ----------

route('GET', '/admin/api/users', { auth: true }, async ({ db, user: actor }) => {
  requireRole(actor, ['admin', 'root']);
  const rows = db.prepare('SELECT id, nickname, slug, dir_name, email, role, status, max_instances, max_running, created_at, last_login_at FROM users ORDER BY id').all() as Omit<UserRow, 'password_hash'>[];
  return { users: rows };
});

interface AdminCreateBody { nickname?: unknown; password?: unknown; role?: unknown; email?: unknown; max_instances?: unknown; max_running?: unknown }

route('POST', '/admin/api/users', { auth: true, csrf: true }, async ({ db, req, user: actor }) => {
  requireRole(actor, ['admin', 'root']);
  const body = await readJson(req) as AdminCreateBody;
  if (typeof body.nickname !== 'string' || typeof body.password !== 'string') {
    throw new HttpError(400, 'invalid_body', 'nickname and password are required');
  }
  if (body.password.length < 8) throw new HttpError(400, 'weak_password', 'password must be at least 8 characters');
  const role: Role = typeof body.role === 'string' && isRole(body.role) ? body.role : 'user';
  if (!canManage(actor.role, role)) throw new HttpError(403, 'forbidden', 'cannot create that role');
  const nickname = body.nickname;
  const password = body.password;
  const email = typeof body.email === 'string' ? body.email : null;
  const maxInstances = typeof body.max_instances === 'number' ? body.max_instances : undefined;
  const maxRunning = typeof body.max_running === 'number' ? body.max_running : undefined;
  let user: UserRow;
  try {
    // 配额校验在 createUserRow 内统一（M2.1：与 PATCH 对齐，含上界）
    user = withTx(db, () => createUserRow(db, { nickname, password, role, email, maxInstances, maxRunning }));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'nickname_taken', 'nickname (or slug/email) already taken');
    throw e;
  }
  audit(db, 'user_create', actor.id, user.id, `created ${role} ${user.nickname} (slug=${user.slug})`);
  return { user: publicUser(user) };
});

route('GET', '/admin/api/users/:id', { auth: true }, async ({ db, req, user: actor }) => {
  requireRole(actor, ['admin', 'root']);
  const id = Number(req.params?.id ?? '');
  if (!Number.isInteger(id)) throw new HttpError(400, 'invalid_id', 'bad user id');
  const user = getUser(db, id);
  if (!user) throw new HttpError(404, 'not_found', 'user not found');
  if (user.id !== actor.id && !canManage(actor.role, user.role)) throw new HttpError(403, 'forbidden', 'cannot manage that role');
  return { user: publicUser(user) };
});

interface AdminPatchBody { status?: unknown; role?: unknown; password?: unknown; max_instances?: unknown; max_running?: unknown }

route('PATCH', '/admin/api/users/:id', { auth: true, csrf: true }, async ({ db, req, user: actor }) => {
  requireRole(actor, ['admin', 'root']);
  const id = Number(req.params?.id ?? '');
  if (!Number.isInteger(id)) throw new HttpError(400, 'invalid_id', 'bad user id');
  const target = getUser(db, id);
  if (!target) throw new HttpError(404, 'not_found', 'user not found');
  // 自己可改（密码/配额；status/role 由下方自改限制禁止）；他人须过 canManage（A3：admin 只能管 user）
  if (id !== actor.id && !canManage(actor.role, target.role)) {
    throw new HttpError(403, 'forbidden', 'cannot manage that role');
  }
  const body = await readJson(req) as AdminPatchBody;
  // 提取局部（withTx 回调内 TS 不保留属性访问的收窄）
  const status = body.status;
  const role = body.role;
  const password = body.password;
  const maxInstances = body.max_instances;
  const maxRunning = body.max_running;
  // M2.1：不能改自己的 status/role（防 root 自杀、admin 自降级）
  if (id === actor.id && (status !== undefined || role !== undefined)) {
    throw new HttpError(403, 'forbidden', 'cannot change own status or role');
  }
  if (status !== undefined && status !== 'active' && status !== 'disabled') {
    throw new HttpError(400, 'invalid_status', 'status must be active|disabled');
  }
  if (role !== undefined) {
    if (!isRole(role)) throw new HttpError(400, 'invalid_role', 'role must be user|admin|root');
    if (!canManage(actor.role, role)) throw new HttpError(403, 'forbidden', 'cannot grant that role');
  }
  // 禁用 = 先停其全部实例（计划 §3.6；异步操作放 DB 事务外）
  if (status === 'disabled') {
    for (const r of listRunningInstances(db, id)) {
      await stopInstance(db, r);
    }
  }
  const changes: string[] = [];
  withTx(db, () => {
    if (status !== undefined) {
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
      if (status === 'disabled') {
        // M2.1：封禁即吊销会话与 API token（此前凭据全部残留）
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
        db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(Date.now(), id);
      }
      changes.push(`status=${status}`);
      audit(db, status === 'disabled' ? 'user_disable' : 'user_enable', actor.id, id, `by ${actor.nickname}`);
    }
    if (role !== undefined) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
      changes.push(`role=${role}`);
    }
    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'weak_password', 'password must be at least 8 characters');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
      // 重置密码即吊销全部会话与 token，防旧凭据复用（M2.1 补 token）
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(Date.now(), id);
      changes.push('password reset (sessions+token revoked)');
      audit(db, 'password_reset', actor.id, id, `by ${actor.nickname}`);
    }
    for (const [key, value] of [['max_instances', maxInstances], ['max_running', maxRunning]] as const) {
      if (value !== undefined) {
        if (typeof value !== 'number' || !validQuota(value)) throw new HttpError(400, 'invalid_quota', `${key} must be an integer in [0, 1000]`);
        db.prepare(`UPDATE users SET ${key} = ? WHERE id = ?`).run(value, id);
        changes.push(`${key}=${value}`);
      }
    }
    if (changes.length === 0) throw new HttpError(400, 'no_changes', 'nothing to update');
  });
  audit(db, 'user_update', actor.id, id, `by ${actor.nickname}: ${changes.join(', ')}`);
  const updated = getUser(db, id);
  if (!updated) throw new HttpError(500, 'internal', 'user fetch failed');
  return { user: publicUser(updated) };
});

route('GET', '/admin/api/audit', { auth: true }, async ({ db, req, user: actor }) => {
  requireRole(actor, ['admin', 'root']);
  const url = new URL(req.url ?? '/', 'http://dsh-hub.invalid');
  const limit = clampInt(url.searchParams.get('limit'), 200, 1000);
  const rows = db.prepare('SELECT id, actor_id, target_user_id, action, detail, created_at FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit);
  return { audit: rows };
});

route('GET', '/admin/api/settings', { auth: true }, async ({ db, user: actor }) => {
  requireRole(actor, ['admin', 'root']);
  return { settings: getSettingsMap(db) };
});

route('PUT', '/admin/api/settings', { auth: true, csrf: true }, async ({ db, req, user: actor }) => {
  requireRole(actor, ['admin', 'root']);
  const body = await readJson(req) as Record<string, unknown>;
  const ALLOWED = new Set<string>(SETTING_KEYS);
  const allowed: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED.has(key)) throw new HttpError(400, 'invalid_key', `unknown setting key: ${key}`);
    if (typeof value !== 'string') throw new HttpError(400, 'invalid_value', `${key} must be a string`);
    if (key === 'registration_open' && value !== 'open' && value !== 'closed') {
      throw new HttpError(400, 'invalid_value', 'registration_open must be open|closed');
    }
    // M2.1：版本相关设置必须过 semver 校验（白名单为空串表示不限制）
    if (key === 'default_harness_version' && value !== '' && !isValidHarnessVersion(value)) {
      throw new HttpError(400, 'invalid_value', 'default_harness_version must be explicit semver like 0.1.1-rc.2 or empty');
    }
    if (key === 'allowed_harness_versions' && value.trim() !== '' && parseAllowedVersions(value) === null) {
      throw new HttpError(400, 'invalid_value', 'allowed_harness_versions must be a comma-separated list of semver or empty');
    }
    allowed[key] = value;
  }
  for (const [key, value] of Object.entries(allowed)) setSetting(db, key, value);
  audit(db, 'user_update', actor.id, null, `settings updated by ${actor.nickname}: ${Object.keys(allowed).join(', ')}`);
  return { settings: allowed };
});

// ---------- 会员系统 ----------

route('GET', '/api/membership/plans', { auth: true }, async () => {
  return {
    plans: Object.entries(MEMBERSHIP_CONFIG).map(([type, cfg]) => ({
      type,
      label: cfg.label,
      price: cfg.price,
      durationDays: cfg.durationDays,
      trial: cfg.trial,
    })),
  };
});

route('POST', '/api/membership/purchase', { auth: true, csrf: true }, async ({ db, req, user }) => {
  const body = await readJson(req) as { type?: string };
  const type = body.type as MembershipType;
  if (!type || !['trial', 'monthly', 'yearly'].includes(type)) {
    throw new HttpError(400, 'invalid_type', 'invalid membership type');
  }
  const order = createOrder(db, user.id, type);
  return { order: { id: order.id, type: order.membership_type, amount: order.amount, status: order.status } };
});

route('GET', '/api/me/membership', { auth: true }, async ({ db, user }) => {
  const membership = getUserMembership(db, user.id);
  return {
    type: membership.type,
    expiresAt: membership.expiresAt,
    isActive: membership.isActive,
    trialUsed: membership.trialUsed,
  };
});

route('GET', '/api/me/orders', { auth: true }, async ({ db, user }) => {
  const orders = getUserOrders(db, user.id);
  return { orders: orders.map(o => ({ id: o.id, type: o.membership_type, amount: o.amount, status: o.status, createdAt: o.created_at, paidAt: o.paid_at })) };
});

route('GET', '/admin/api/orders', { auth: true }, async ({ db, req, user: actor }) => {
  requireRole(actor, ['admin', 'root']);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const orders = getAllOrders(db, limit, offset);
  return { orders: orders.map(o => ({ id: o.id, userId: o.user_id, type: o.membership_type, amount: o.amount, status: o.status, createdAt: o.created_at, paidAt: o.paid_at })) };
});

// ---------- 支付 ----------

route('POST', '/api/payment/create', { auth: true, csrf: true }, async ({ db, req, user }) => {
  const payConfig = getXunhupayConfig(db);
  if (!payConfig) {
    throw new HttpError(503, 'payment_not_configured', '支付功能尚未配置');
  }

  const body = await readJson(req) as { type?: string };
  const type = body.type as MembershipType;
  if (!type || !['monthly', 'yearly'].includes(type)) {
    throw new HttpError(400, 'invalid_type', '请选择有效的会员套餐');
  }

  // 创建 pending 订单
  const order = createOrder(db, user.id, type);
  const cfg = MEMBERSHIP_CONFIG[type];

  // 构造回调和返回 URL
  const hubHost = req.headers.host ?? 'localhost';
  const protocol = req.headers['x-forwarded-proto'] ?? 'http';
  const baseUrl = `${protocol}://${hubHost}`;
  const notifyUrl = `${baseUrl}/api/payment/notify`;
  const returnUrl = `${baseUrl}/payment/return?order_id=${order.id}`;

  const result = await createPayment(payConfig, {
    trade_order_id: String(order.id),
    total_fee: cfg.price.toFixed(2),
    title: `乌鸦Work - ${cfg.label}`,
    notify_url: notifyUrl,
    return_url: returnUrl,
  });

  if (result.errcode !== 0) {
    throw new HttpError(502, 'payment_create_failed', result.errmsg || '支付创建失败');
  }

  return {
    orderId: order.id,
    urlQrcode: result.url_qrcode ?? '',
    url: result.url ?? '',
    amount: cfg.price,
  };
});

// 支付回调（无需鉴权，签名验证）
route('POST', '/api/payment/notify', { auth: false, csrf: false }, async ({ db, req, res }) => {
  const form = await readForm(req);
  const params = form as unknown as NotifyParams;

  const payConfig = getXunhupayConfig(db);
  if (!payConfig) {
    throw new HttpError(503, 'payment_not_configured', '支付未配置');
  }

  // 验证签名
  const hashValue = params.hash;
  if (!hashValue || !verifyHash(params as unknown as Record<string, string>, hashValue, payConfig.appsecret)) {
    audit(db, 'payment_notify', null, null, 'hash_verify_failed');
    throw new HttpError(400, 'invalid_hash', '签名验证失败');
  }

  // 处理回调
  const result = handlePaymentCallback(
    db,
    params.trade_order_id,
    params.total_fee,
    params.transaction_id,
    params.status,
  );

  if (!result.ok && result.message !== 'already paid') {
    audit(db, 'payment_notify', null, null, `callback_failed: ${result.message}`);
    throw new HttpError(400, 'callback_failed', result.message);
  }

  // 虎皮椒要求返回纯文本 "success"
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('success');
});

route('GET', '/api/payment/query/:orderId', { auth: true }, async ({ db, user, params }) => {
  const orderId = Number(params.orderId);
  const order = getOrderById(db, orderId);

  if (!order || order.user_id !== user.id) {
    throw new HttpError(404, 'not_found', '订单不存在');
  }

  return {
    status: order.status,
    paid: order.status === 'paid',
    orderId: order.id,
  };
});

// ---------- 实例（M2） ----------

/** 取实例并校验属主（或管理员）。读操作非属主 404（不泄露存在性），写操作 403。 */
function requireInstance(db: DatabaseSync, actor: UserRow, id: string, opts: { write?: boolean } = {}): InstanceRecord {
  const record = getInstance(db, id);
  if (!record) throw new HttpError(404, 'not_found', 'instance not found');
  if (record.owner_id === actor.id) return record;
  if (actor.role === 'admin' || actor.role === 'root') {
    if (opts.write) audit(db, 'instance_admin', actor.id, record.owner_id, `admin ${opts.write ? 'write' : 'read'} on ${id}`);
    return record;
  }
  throw new HttpError(opts.write ? 403 : 404, opts.write ? 'forbidden' : 'not_found', 'instance not found');
}

function publicInstance(r: InstanceRecord): Record<string, unknown> {
  return {
    id: r.id, name: r.name, port: r.port, harness_version: r.harness_version,
    trusted_host: r.trusted_host, status: r.status, pid: r.pid,
    auto_restart: r.auto_restart === 1, created_at: r.created_at, last_started_at: r.last_started_at,
    owner_id: r.owner_id, owner_nickname: r.nickname ?? undefined,
  };
}

/**
 * 实例写操作 per-instance 互斥（M2.1，B4）：同一实例的 start/stop/restart/delete
 * 并发时第二个请求 409，杜绝「stop 删锁 + start 探活 → 同端口双开」等竞态。
 */
const instanceOps = new Set<string>();
async function withInstanceOp<T>(id: string, fn: () => Promise<T>): Promise<T> {
  if (instanceOps.has(id)) throw new HttpError(409, 'instance_busy', 'another operation on this instance is in progress');
  instanceOps.add(id);
  try {
    return await fn();
  } finally {
    instanceOps.delete(id);
  }
}

route('GET', '/api/instances', { auth: true }, async ({ db, user }) => {
  return { instances: listInstances(db, user.id).map(publicInstance) };
});

route('POST', '/api/instances', { auth: true, csrf: true }, async ({ db, req, user }) => {
  const body = await readJson(req) as { name?: unknown; harness_version?: unknown };
  if (typeof body.name !== 'string' && body.name !== undefined) throw new HttpError(400, 'invalid_body', 'name must be a string');
  // M2.1：版本白名单——显式 semver 校验 + default_harness_version 生效 + 精确白名单
  let harnessVersion: string | null = null;
  if (typeof body.harness_version === 'string' && body.harness_version) {
    if (!isValidHarnessVersion(body.harness_version)) {
      throw new HttpError(400, 'invalid_harness_version', 'harness_version must be explicit semver like 0.1.1-rc.2');
    }
    harnessVersion = body.harness_version;
  } else {
    const def = getSetting(db, 'default_harness_version', '');
    if (def && isValidHarnessVersion(def)) harnessVersion = def;
  }
  const allowed = parseAllowedVersions(getSetting(db, 'allowed_harness_versions', ''));
  if (!versionAllowed(harnessVersion, allowed)) {
    throw new HttpError(403, 'harness_version_not_allowed', 'harness version not in allowed list');
  }
  let record: InstanceRecord;
  try {
    record = await createInstance(db, user, {
      name: typeof body.name === 'string' ? body.name : `${user.nickname}`,
      harnessVersion,
    });
  } catch (e) {
    if (e instanceof Error && /quota/.test(e.message)) throw new HttpError(403, 'quota_exceeded', e.message);
    if (e instanceof Error && /no free port/.test(e.message)) throw new HttpError(503, 'no_free_port', e.message);
    throw e;
  }
  audit(db, 'instance_create', user.id, user.id, `created ${record.id} port=${record.port} name=${record.name}`);
  return { instance: publicInstance(record) };
});

route('GET', '/api/instances/:id', { auth: true }, async ({ db, req, user }) => {
  const record = requireInstance(db, user, req.params?.id ?? '');
  return { instance: publicInstance(record) };
});

route('GET', '/api/instances/:id/logs', { auth: true }, async ({ db, req, user }) => {
  const record = requireInstance(db, user, req.params?.id ?? '');
  const url = new URL(req.url ?? '/', 'http://dsh-hub.invalid');
  const tail = clampInt(url.searchParams.get('tail'), 200, 2000);
  return { id: record.id, log: tailLog(record, tail) };
});

route('POST', '/api/instances/:id/start', { auth: true, csrf: true }, async ({ db, req, user }) => {
  const record = requireInstance(db, user, req.params?.id ?? '', { write: true });
  return withInstanceOp(record.id, async () => {
    if (record.owner_id === user.id) {
      const running = runningCount(db, user.id);
      if (running >= user.max_running) throw new HttpError(403, 'quota_exceeded', `max_running quota reached (${user.max_running})`);
    }
    const result = await startInstance(db, record);
    audit(db, 'instance_start', user.id, record.owner_id, `start ${record.id} -> ${result.status}${result.pid ? ` pid=${result.pid}` : ''}`);
    if (result.status === 'failed') throw new HttpError(502, 'start_failed', result.error ?? 'start failed');
    const fresh = getInstance(db, record.id)!;
    return { instance: publicInstance(fresh) };
  });
});

route('POST', '/api/instances/:id/stop', { auth: true, csrf: true }, async ({ db, req, user }) => {
  const record = requireInstance(db, user, req.params?.id ?? '', { write: true });
  return withInstanceOp(record.id, async () => {
    await stopInstance(db, record);
    audit(db, 'instance_stop', user.id, record.owner_id, `stop ${record.id}`);
    const fresh = getInstance(db, record.id)!;
    return { instance: publicInstance(fresh) };
  });
});

route('POST', '/api/instances/:id/restart', { auth: true, csrf: true }, async ({ db, req, user }) => {
  const record = requireInstance(db, user, req.params?.id ?? '', { write: true });
  return withInstanceOp(record.id, async () => {
    await stopInstance(db, record);
    audit(db, 'instance_restart', user.id, record.owner_id, `restart ${record.id}`);
    if (record.owner_id === user.id) {
      const running = runningCount(db, user.id);
      if (running >= user.max_running) throw new HttpError(403, 'quota_exceeded', `max_running quota reached (${user.max_running})`);
    }
    const result = await startInstance(db, getInstance(db, record.id)!);
    if (result.status === 'failed') throw new HttpError(502, 'start_failed', result.error ?? 'restart failed');
    const fresh = getInstance(db, record.id)!;
    return { instance: publicInstance(fresh) };
  });
});

route('DELETE', '/api/instances/:id', { auth: true, csrf: true }, async ({ db, req, user }) => {
  const record = requireInstance(db, user, req.params?.id ?? '', { write: true });
  return withInstanceOp(record.id, async () => {
    await stopInstance(db, record);
    deleteInstance(db, record);
    audit(db, 'instance_delete', user.id, record.owner_id, `deleted ${record.id} port=${record.port}`);
    return { ok: true, id: record.id };
  });
});

// 管理面：跨用户实例总览
route('GET', '/admin/api/instances', { auth: true }, async ({ db, user }) => {
  requireRole(user, ['admin', 'root']);
  return { instances: listAllInstances(db).map(publicInstance) };
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

      // M3: 鉴权网关优先（子域名路由）
      const gatewayHandled = await handleGatewayRequest(req, res);
      if (gatewayHandled) return;

      // 页面路由优先（GET 非 /api/ 路径，POST 非 /api/ 路径）
      if (!url.pathname.startsWith('/api/') && url.pathname !== '/healthz') {
        const handled = await handlePageRequest(db, req, res);
        if (handled) return;
      }

      const match = matchRoute(routes, method, url.pathname);
      if (!match) {
        // DSH API fallback：如果请求 /api/* 但 hub 没有路由，尝试代理到用户的 DSH 实例
        if (url.pathname.startsWith('/api/')) {
          const proxied = await proxyToDshInstance(db, req, res);
          if (proxied) return;
        }
        sendJson(res, 404, { error: { code: 'not_found', message: 'not found' } });
        return;
      }
      const { route: matched, params } = match;
      req.params = params;
      // 统一鉴权（auth 路由强制 status=active）与 CSRF（仅会话鉴权）
      let user: UserRow | undefined;
      let viaSession = false;
      if (matched.auth) {
        const auth = authenticate(db, req);
        if (!auth) throw new HttpError(401, 'unauthorized', 'login required');
        user = auth.user;
        viaSession = auth.viaSession;
      }
      if (matched.csrf && viaSession) assertCsrf(req, parseCookies(req));
      const result = await matched.handler({ db, req, res, params, user: user! });
      if (res.headersSent) return;
      // handler 若已 setHeader('set-cookie')（登录等建会话），sendJson 的 writeHead 会合并保留。
      sendJson(res, 200, result ?? { ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  // M3: WebSocket 升级处理（鉴权网关 WS 隧道）
  server.on('upgrade', async (req, socket, head) => {
    console.log(`[api] WebSocket upgrade: ${req.url}`);
    const handled = await handleGatewayWebSocket(req, socket as any, head);
    if (handled) {
      console.log(`[api] WebSocket handled by gateway: ${req.url}`);
      return;
    }
    // DSH WebSocket fallback：/api/events.mux、/api/events.host 等绝对路径
    const proxied = await proxyWebSocketToDshInstance(db, req, socket as any, head);
    if (proxied) {
      console.log(`[api] WebSocket proxied to DSH instance: ${req.url}`);
      return;
    }
    console.log(`[api] WebSocket destroyed (no handler): ${req.url}`);
    socket.destroy();
  });

  server.listen(opts.port ?? config.port, opts.host ?? config.host);
  return server;
}

// TS 扩展：在 IncomingMessage 上挂 params
declare module 'node:http' {
  interface IncomingMessage {
    params?: Record<string, string>;
  }
}
