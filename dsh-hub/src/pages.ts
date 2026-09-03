/**
 * DSH Hub · 页面路由（Web UI MVP）
 *
 * 服务端渲染页面路由，与 API 路由共存于同一 HTTP 服务。
 * GET 请求渲染 HTML 页面，POST 请求处理表单提交后重定向。
 */
import http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { escapeHtml, readForm, redirect, sendHtml, parseCookies } from './http.ts';
import { authenticate, assertCsrf, attemptLogin } from './auth.ts';
import { getSetting } from './settings.ts';
import { getUser, createUserRow, type UserRow } from './users.ts';
import { createSession, destroySession, SESSION_COOKIE, CSRF_COOKIE } from './sessions.ts';
import { hashPassword, verifyPassword, DUMMY_HASH } from './pwd.ts';
import { config } from './config.ts';
import { listInstances, getInstance, createInstance, deleteInstance, listAllInstances, runningCount, listRunningInstances } from './instances.ts';
import { startInstance, stopInstance, tailLog } from './supervisor/index.ts';
import { audit, withTx } from './db.ts';
import { timingSafeEqual } from 'node:crypto';
import { disableUser } from './users.ts';
import { hasActiveMembership, getUserOrders, createOrder, getUserMembership, MEMBERSHIP_CONFIG, adminSetMembership, getAllOrders, expireMemberships, getAllMembershipPrices, type MembershipType } from './membership.ts';

// 页面视图
import { renderSetupPage, renderLoginPage, renderRegisterPage, renderForgotPasswordPage, renderResetPasswordPage } from './views/auth.ts';
import { renderInstancesPage, renderNewInstancePage, renderInstanceDetailPage, renderMembershipPage, renderProfilePage, renderPaymentReturnPage } from './views/user.ts';
import { renderDashboardPage, renderUsersPage, renderAdminInstancesPage, renderAuditPage, renderSettingsPage, renderAdminMembershipPage, renderAdminPricesPage } from './views/admin.ts';
import { createResetCode, sendResetCodeEmail, verifyResetCode } from './email.ts';
import { getUserByAccount, getUserByEmail, isValidEmail, isValidUsername, getUserByUsername } from './users.ts';

/** 页面路由上下文 */
interface PageCtx {
  db: DatabaseSync;
  req: http.IncomingMessage;
  res: http.ServerResponse;
  params: Record<string, string>;
  user: UserRow | null;
}

/** 检查数据库是否有用户 */
function hasUsers(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  return row.c > 0;
}

/** 会话 cookie 设置 */
function setSessionCookie(res: http.ServerResponse, token: string, csrf: string): void {
  const secure = config.cookieSecure ? '; Secure' : '';
  res.setHeader('set-cookie', [
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}${secure}`,
    `${CSRF_COOKIE}=${csrf}; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}${secure}`,
  ]);
}

/** 清除会话 cookie */
function clearSessionCookie(res: http.ServerResponse): void {
  res.setHeader('set-cookie', [
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    `${CSRF_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  ]);
}

/** 页面表单 CSRF 校验（已登录用户的 POST 请求） */
function assertPageCsrf(req: http.IncomingMessage, form: Record<string, string>): void {
  const cookies = parseCookies(req);
  const expected = cookies[CSRF_COOKIE];
  const got = form._csrf;
  if (!expected || !got || !timingSafeEqual(Buffer.from(expected), Buffer.from(got))) {
    throw new HttpError(403, 'csrf_invalid', 'CSRF 校验失败');
  }
}

class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** 路由匹配 */
function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const patternSegs = pattern.split('/').filter(Boolean);
  const pathSegs = pathname.split('/').filter(Boolean);
  if (patternSegs.length !== pathSegs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegs.length; i++) {
    const p = patternSegs[i]!;
    const s = pathSegs[i]!;
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(s);
    } else if (p !== s) {
      return null;
    }
  }
  return params;
}

/** 页面路由表 */
interface PageRoute {
  method: 'GET' | 'POST';
  pattern: string;
  handler: (ctx: PageCtx) => Promise<void> | void;
}

const pageRoutes: PageRoute[] = [];

function page(method: 'GET' | 'POST', pattern: string, handler: (ctx: PageCtx) => Promise<void> | void): void {
  pageRoutes.push({ method, pattern, handler });
}

// ========== 公共页面 ==========

// GET /setup - 首启向导页面
page('GET', '/setup', ({ db, res }) => {
  if (hasUsers(db)) {
    redirect(res, '/login');
    return;
  }
  sendHtml(res, 200, renderSetupPage());
});

// POST /setup - 创建管理员
page('POST', '/setup', async ({ db, req, res }) => {
  if (hasUsers(db)) {
    redirect(res, '/login');
    return;
  }
  const form = await readForm(req);
  const { nickname, username, password, password2, email } = form;

  if (!nickname || !password) {
    sendHtml(res, 400, renderSetupPage('请填写所有必填字段'));
    return;
  }
  if (password !== password2) {
    sendHtml(res, 400, renderSetupPage('两次密码输入不一致'));
    return;
  }
  if (password.length < 8) {
    sendHtml(res, 400, renderSetupPage('密码至少 8 个字符'));
    return;
  }

  // username 默认为 nickname
  const finalUsername = username?.trim() || nickname;

  try {
    let user: UserRow;
    withTx(db, () => {
      const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
      if (count > 0) throw new Error('setup_closed');
      user = createUserRow(db, {
        nickname,
        username: finalUsername,
        email: email || null,
        passwordHash: hashPassword(password),
        role: 'admin',
      });
    });
    audit(db, 'setup', user!.id, user!.id, `setup created admin ${user!.nickname}`);
    const { token, csrf } = createSession(db, user!.id, null, null);
    setSessionCookie(res, token, csrf);
    redirect(res, '/admin');
  } catch (e) {
    const msg = e instanceof Error && e.message === 'setup_closed' ? '已有用户，无法设置' : '创建失败：' + (e instanceof Error ? e.message : String(e));
    sendHtml(res, 400, renderSetupPage(msg));
  }
});

// GET /login - 登录页面
page('GET', '/login', ({ db, req, res }) => {
  // 已登录用户重定向
  const auth = authenticate(db, req);
  if (auth) {
    redirect(res, (auth.user.role === 'admin' || auth.user.role === 'root') ? '/admin' : '/');
    return;
  }
  const regOpen = getSetting(db, 'registration_open', 'closed') === 'open';
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderLoginPage(undefined, regOpen, csrf));
});

// POST /login - 登录处理
page('POST', '/login', async ({ db, req, res }) => {
  const form = await readForm(req);
  const { account, password } = form;
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';

  if (!account || !password) {
    sendHtml(res, 400, renderLoginPage('请填写所有必填字段', false, csrf));
    return;
  }

  try {
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? req.socket.remoteAddress ?? null;
    const ua = req.headers['user-agent'] ?? null;
    const result = attemptLogin(db, account, password, ip, ua);
    setSessionCookie(res, result.token, result.csrf);
    const isAdmin = result.user.role === 'admin' || result.user.role === 'root';
    if (isAdmin) {
      redirect(res, '/admin');
    } else {
      // 会员系统：无有效会员的用户重定向到会员购买页面
      const hasMembership = hasActiveMembership(db, result.user.id);
      redirect(res, hasMembership ? '/' : '/membership');
    }
  } catch (e) {
    if (e instanceof HttpError) {
      const regOpen = getSetting(db, 'registration_open', 'closed') === 'open';
      const msg = e.code === 'disabled' ? '账号已被禁用' : '用户名/邮箱或密码错误';
      sendHtml(res, e.status, renderLoginPage(msg, regOpen, csrf));
    } else {
      sendHtml(res, 500, renderLoginPage('登录失败：' + (e instanceof Error ? e.message : String(e)), false, csrf));
    }
  }
});

// GET /register - 注册页面
page('GET', '/register', ({ db, res }) => {
  const regOpen = getSetting(db, 'registration_open', 'closed') === 'open';
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (!regOpen && userCount > 0) {
    redirect(res, '/login');
    return;
  }
  sendHtml(res, 200, renderRegisterPage());
});

// POST /register - 注册处理
page('POST', '/register', async ({ db, req, res }) => {
  const regOpen = getSetting(db, 'registration_open', 'closed') === 'open';
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (!regOpen && userCount > 0) {
    sendHtml(res, 403, renderRegisterPage('注册已关闭'));
    return;
  }

  const form = await readForm(req);
  const { nickname, username, email, password, password2 } = form;
  const effectiveNickname = (nickname || username || '').trim();
  const formPreserve = { nickname, username, email };

  if (!username || !email || !password) {
    sendHtml(res, 400, renderRegisterPage('请填写所有必填字段', formPreserve));
    return;
  }
  if (password !== password2) {
    sendHtml(res, 400, renderRegisterPage('两次密码输入不一致', formPreserve));
    return;
  }
  if (password.length < 8) {
    sendHtml(res, 400, renderRegisterPage('密码至少 8 个字符', formPreserve));
    return;
  }
  if (!isValidUsername(username)) {
    sendHtml(res, 400, renderRegisterPage('用户名格式不正确（3-32位字母数字下划线）', formPreserve));
    return;
  }
  if (!isValidEmail(email)) {
    sendHtml(res, 400, renderRegisterPage('邮箱格式不正确', formPreserve));
    return;
  }
  if (getUserByUsername(db, username)) {
    sendHtml(res, 400, renderRegisterPage('用户名已被使用', formPreserve));
    return;
  }
  if (getUserByEmail(db, email)) {
    sendHtml(res, 400, renderRegisterPage('邮箱已被注册', formPreserve));
    return;
  }

  try {
    let user: UserRow;
    withTx(db, () => {
      const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
      const role = count === 0 ? 'root' : 'user';
      user = createUserRow(db, {
        nickname: effectiveNickname,
        username,
        email,
        passwordHash: hashPassword(password),
        role,
      });
    });
    audit(db, 'register', user!.id, user!.id, `registered as ${user!.role}`);
    const { token, csrf } = createSession(db, user!.id, null, null);
    setSessionCookie(res, token, csrf);
    
    // 会员系统：注册后不再自动创建实例，重定向到会员购买页面
    redirect(res, '/membership');
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('UNIQUE') ? '昵称或用户名已被使用' : '注册失败：' + (e instanceof Error ? e.message : String(e));
    sendHtml(res, 400, renderRegisterPage(msg));
  }
});

// POST /api/auth/logout - 登出（页面表单提交）
page('POST', '/api/auth/logout', ({ db, req, res }) => {
  const cookies: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const pair of cookieHeader.split(';')) {
      const idx = pair.indexOf('=');
      if (idx > 0) cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }
  const token = cookies[SESSION_COOKIE];
  if (token) destroySession(db, token);
  clearSessionCookie(res);
  redirect(res, '/login');
});

// GET /forgot-password - 找回密码页面
page('GET', '/forgot-password', ({ res }) => {
  sendHtml(res, 200, renderForgotPasswordPage());
});

// POST /forgot-password - 发送验证码
page('POST', '/forgot-password', async ({ db, req, res }) => {
  const form = await readForm(req);
  const { email } = form;

  if (!email || !isValidEmail(email)) {
    sendHtml(res, 400, renderForgotPasswordPage('请输入有效的邮箱地址'));
    return;
  }

  const user = getUserByEmail(db, email.toLowerCase());
  if (user) {
    const code = createResetCode(db, email.toLowerCase());
    try {
      await sendResetCodeEmail(email.toLowerCase(), code);
    } catch (err) {
      console.error('Failed to send reset email:', err);
    }
  }
  // 无论邮箱是否存在，都显示成功（防枚举）
  sendHtml(res, 200, renderForgotPasswordPage(undefined, '如果邮箱已注册，您将收到重置验证码。请检查邮箱。'));
});

// GET /reset-password - 重置密码页面
page('GET', '/reset-password', ({ req, res }) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const email = url.searchParams.get('email') ?? '';
  if (!email) {
    redirect(res, '/forgot-password');
    return;
  }
  sendHtml(res, 200, renderResetPasswordPage(email));
});

// POST /reset-password - 重置密码处理
page('POST', '/reset-password', async ({ db, req, res }) => {
  const form = await readForm(req);
  const { email, code, password, password2 } = form;

  if (!email || !code || !password) {
    sendHtml(res, 400, renderResetPasswordPage(email ?? '', '请填写所有字段'));
    return;
  }
  if (password !== password2) {
    sendHtml(res, 400, renderResetPasswordPage(email, '两次密码输入不一致'));
    return;
  }
  if (password.length < 8) {
    sendHtml(res, 400, renderResetPasswordPage(email, '密码至少 8 个字符'));
    return;
  }

  const emailLower = email.toLowerCase();
  if (!verifyResetCode(db, emailLower, code)) {
    sendHtml(res, 400, renderResetPasswordPage(email, '验证码无效或已过期'));
    return;
  }

  const user = getUserByEmail(db, emailLower);
  if (!user) {
    sendHtml(res, 400, renderResetPasswordPage(email, '用户不存在'));
    return;
  }

  const passwordHash = hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
  // 吊销所有会话和 token
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(Date.now(), user.id);
  audit(db, 'password_reset', null, user.id, `email=${emailLower}`);

  redirect(res, '/login?reset=success');
});

// ========== 用户页面 ==========

// GET / - 实例列表
page('GET', '/', ({ db, req, res }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  // 会员系统：无有效会员重定向到购买页面
  if (!hasActiveMembership(db, auth.user.id)) { redirect(res, '/membership'); return; }
  const instances = listInstances(db, auth.user.id);
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderInstancesPage(auth.user, instances, undefined, csrf));
});

// GET /instances/new - 新建实例页面
page('GET', '/instances/new', ({ db, req, res }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderNewInstancePage(auth.user, undefined, csrf));
});

// POST /instances - 创建实例
page('POST', '/instances', async ({ db, req, res }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  const form = await readForm(req);
  assertPageCsrf(req, form);
  try {
    await createInstance(db, auth.user, {
      name: form.name || `${auth.user.nickname} 的实例`,
      harnessVersion: form.harness_version || null,
    });
    redirect(res, '/');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
    sendHtml(res, 400, renderNewInstancePage(auth.user, msg, csrf));
  }
});

// GET /instances/:id - 实例详情
page('GET', '/instances/:id', ({ db, req, res, params }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  const instId = params.id ?? '';
  const inst = getInstance(db, instId);
  if (!inst || (inst.owner_id !== auth.user.id && auth.user.role === 'user')) {
    sendHtml(res, 404, renderInstancesPage(auth.user, [], { type: 'danger', message: '实例不存在' }));
    return;
  }
  const logs = inst.status === 'running' ? tailLog(inst, 200) : '';
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderInstanceDetailPage(auth.user, inst, logs, csrf));
});

// POST /instances/:id/start - 启动实例
page('POST', '/instances/:id/start', async ({ db, req, res, params }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  const form = await readForm(req);
  assertPageCsrf(req, form);
  const instId = params.id ?? '';
  const inst = getInstance(db, instId);
  if (!inst || (inst.owner_id !== auth.user.id && auth.user.role === 'user')) {
    redirect(res, '/');
    return;
  }
  await startInstance(db, inst);
  audit(db, 'instance_start', auth.user.id, inst.owner_id, `start ${inst.id}`);
  redirect(res, `/instances/${instId}`);
});

// POST /instances/:id/stop - 停止实例
page('POST', '/instances/:id/stop', async ({ db, req, res, params }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  const form = await readForm(req);
  assertPageCsrf(req, form);
  const instId = params.id ?? '';
  const inst = getInstance(db, instId);
  if (!inst || (inst.owner_id !== auth.user.id && auth.user.role === 'user')) {
    redirect(res, '/');
    return;
  }
  await stopInstance(db, inst);
  audit(db, 'instance_stop', auth.user.id, inst.owner_id, `stop ${inst.id}`);
  redirect(res, `/instances/${instId}`);
});

// POST /instances/:id/restart - 重启实例
page('POST', '/instances/:id/restart', async ({ db, req, res, params }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  const form = await readForm(req);
  assertPageCsrf(req, form);
  const instId = params.id ?? '';
  const inst = getInstance(db, instId);
  if (!inst || (inst.owner_id !== auth.user.id && auth.user.role === 'user')) {
    redirect(res, '/');
    return;
  }
  await stopInstance(db, inst);
  const restarted = getInstance(db, instId);
  if (restarted) await startInstance(db, restarted);
  audit(db, 'instance_restart', auth.user.id, inst.owner_id, `restart ${inst.id}`);
  redirect(res, `/instances/${instId}`);
});

// POST /instances/:id/delete - 删除实例
page('POST', '/instances/:id/delete', async ({ db, req, res, params }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  const form = await readForm(req);
  assertPageCsrf(req, form);
  const instId = params.id ?? '';
  const inst = getInstance(db, instId);
  if (!inst || (inst.owner_id !== auth.user.id && auth.user.role === 'user')) {
    redirect(res, '/');
    return;
  }
  deleteInstance(db, inst);
  audit(db, 'instance_delete', auth.user.id, inst.owner_id, `delete ${inst.id}`);
  redirect(res, '/');
});

// ========== 管理后台页面 ==========

function requireAdmin(db: DatabaseSync, req: http.IncomingMessage, res: http.ServerResponse): UserRow | null {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return null; }
  if (auth.user.role !== 'admin' && auth.user.role !== 'root') {
    sendHtml(res, 403, '<h1>403 - 无权访问</h1>');
    return null;
  }
  return auth.user;
}

// GET /admin - 仪表盘
page('GET', '/admin', ({ db, req, res }) => {
  const user = requireAdmin(db, req, res);
  if (!user) return;
  const users = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  const instances = (db.prepare('SELECT COUNT(*) AS c FROM instances').get() as { c: number }).c;
  const running = (db.prepare("SELECT COUNT(*) AS c FROM instances WHERE status = 'running'").get() as { c: number }).c;
  sendHtml(res, 200, renderDashboardPage(user, { users, instances, running }));
});

// GET /admin/users - 用户管理
page('GET', '/admin/users', ({ db, req, res }) => {
  const user = requireAdmin(db, req, res);
  if (!user) return;
  const users = db.prepare('SELECT id, nickname, username, role, status, max_instances, max_running, created_at, last_login_at, membership_type, membership_expires_at FROM users ORDER BY id').all() as unknown as UserInfo[];
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderUsersPage(user, users, undefined, csrf));
});

// POST /admin/users - 创建用户
page('POST', '/admin/users', async ({ db, req, res }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
  const form = await readForm(req);
  assertPageCsrf(req, form);
  try {
    // 验证邮箱必填
    const email = form.email?.trim();
    if (!email) {
      throw new Error('邮箱不能为空');
    }
    // 昵称可选，如果未填写则使用用户名
    const username = form.username ?? '';
    const nickname = form.nickname?.trim() || username;
    let newUser: UserRow | null = null;
    withTx(db, () => {
      newUser = createUserRow(db, {
        nickname,
        username,
        email,
        passwordHash: hashPassword(form.password ?? ''),
        role: (form.role as any) ?? 'user',
      });
    });
    audit(db, 'user_create', actor.id, newUser!.id, `created user ${nickname}`);
    
    // 如果选择了会员类型，为用户设置会员
    const membershipType = form.membership_type as MembershipType;
    if (membershipType && ['trial', 'monthly', 'yearly'].includes(membershipType)) {
      const durations: Record<string, number> = { trial: 1, monthly: 30, yearly: 365 };
      const days = durations[membershipType] ?? 30;
      adminSetMembership(db, actor.id, newUser!.id, membershipType, days);
    }
    
    redirect(res, '/admin/users');
  } catch (e) {
    const users = db.prepare('SELECT id, nickname, username, role, status, max_instances, max_running, created_at, last_login_at, membership_type, membership_expires_at FROM users ORDER BY id').all() as unknown as UserInfo[];
    const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
    sendHtml(res, 400, renderUsersPage(actor, users, { type: 'danger', message: '创建失败：' + (e instanceof Error ? e.message : String(e)) }, csrf));
  }
});

// POST /admin/users/:id/disable - 封禁用户
page('POST', '/admin/users/:id/disable', async ({ db, req, res, params }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
  const form = await readForm(req);
  assertPageCsrf(req, form);
  const id = Number(params.id ?? 0);
  const target = getUser(db, id);
  if (!target) { redirect(res, '/admin/users'); return; }
  try {
    await disableUser(db, id, stopInstance, listRunningInstances);
    audit(db, 'user_disable', actor.id, id, `disabled ${target.nickname}`);
  } catch (e) {
    console.error('disableUser failed:', e);
  }
  redirect(res, '/admin/users');
});

// POST /admin/users/:id/enable - 启用用户
page('POST', '/admin/users/:id/enable', async ({ db, req, res, params }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
  const form = await readForm(req);
  assertPageCsrf(req, form);
  const id = Number(params.id ?? 0);
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run('active', id);
  audit(db, 'user_enable', actor.id, id);
  redirect(res, '/admin/users');
});

// GET /admin/instances - 实例总览
page('GET', '/admin/instances', ({ db, req, res }) => {
  const user = requireAdmin(db, req, res);
  if (!user) return;
  const instances = listAllInstances(db);
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderAdminInstancesPage(user, instances, csrf));
});

// POST /admin/instances/:id/start - 管理员启动实例
page('POST', '/admin/instances/:id/start', async ({ db, req, res, params }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
  const form = await readForm(req);
  assertPageCsrf(req, form);
  const instId = params.id ?? '';
  const inst = getInstance(db, instId);
  if (!inst) { redirect(res, '/admin/instances'); return; }
  await startInstance(db, inst);
  audit(db, 'instance_start', actor.id, inst.owner_id, `admin start ${inst.id}`);
  redirect(res, '/admin/instances');
});

// POST /admin/instances/:id/stop - 管理员停止实例
page('POST', '/admin/instances/:id/stop', async ({ db, req, res, params }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
  const form = await readForm(req);
  assertPageCsrf(req, form);
  const instId = params.id ?? '';
  const inst = getInstance(db, instId);
  if (!inst) { redirect(res, '/admin/instances'); return; }
  await stopInstance(db, inst);
  audit(db, 'instance_stop', actor.id, inst.owner_id, `admin stop ${inst.id}`);
  redirect(res, '/admin/instances');
});

// POST /admin/instances/:id/delete - 管理员删除实例
page('POST', '/admin/instances/:id/delete', async ({ db, req, res, params }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
  const form = await readForm(req);
  assertPageCsrf(req, form);
  const instId = params.id ?? '';
  const inst = getInstance(db, instId);
  if (!inst) { redirect(res, '/admin/instances'); return; }
  deleteInstance(db, inst);
  audit(db, 'instance_delete', actor.id, inst.owner_id, `admin delete ${inst.id}`);
  redirect(res, '/admin/instances');
});

// GET /admin/audit - 审计日志
page('GET', '/admin/audit', ({ db, req, res }) => {
  const user = requireAdmin(db, req, res);
  if (!user) return;
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all() as unknown as AuditEntry[];
  sendHtml(res, 200, renderAuditPage(user, logs));
});

// GET /admin/settings - 全局设置
page('GET', '/admin/settings', ({ db, req, res }) => {
  const user = requireAdmin(db, req, res);
  if (!user) return;
  const settings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderSettingsPage(user, map, undefined, csrf));
});

// POST /admin/settings - 保存设置
page('POST', '/admin/settings', async ({ db, req, res }) => {
  const user = requireAdmin(db, req, res);
  if (!user) return;
  const form = await readForm(req);
  assertPageCsrf(req, form);
  const allowedKeys = ['registration_open', 'default_harness_version', 'allowed_harness_versions'];
  for (const key of allowedKeys) {
    if (form[key] !== undefined) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, form[key] ?? '');
    }
  }
  audit(db, 'user_update', user.id, null, `settings updated: ${allowedKeys.filter(k => form[k] !== undefined).join(', ')}`);
  const settings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderSettingsPage(user, map, { type: 'success', message: '设置已保存' }, csrf));
});

// POST /admin/settings/payment - 保存支付配置
page('POST', '/admin/settings/payment', async ({ db, req, res }) => {
  const user = requireAdmin(db, req, res);
  if (!user) return;
  const form = await readForm(req);
  assertPageCsrf(req, form);

  if (form.xunhupay_appid !== undefined) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('xunhupay_appid', form.xunhupay_appid ?? '');
  }
  if (form.xunhupay_appsecret) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('xunhupay_appsecret', form.xunhupay_appsecret);
  }
  if (form.xunhupay_gateway !== undefined) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('xunhupay_gateway', form.xunhupay_gateway ?? '');
  }

  audit(db, 'user_update', user.id, null, 'payment settings updated');
  const settings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderSettingsPage(user, map, { type: 'success', message: '支付配置已保存' }, csrf));
});

// ========== 会员系统页面 ==========

// GET /membership - 会员购买页面
page('GET', '/membership', ({ db, req, res }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  const membership = getUserMembership(db, auth.user.id);
  const prices = getAllMembershipPrices(db);
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderMembershipPage(auth.user, membership, prices, null, csrf));
});

// GET /payment/return - 支付成功返回页
page('GET', '/payment/return', ({ db, req, res }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  const membership = getUserMembership(db, auth.user.id);
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderPaymentReturnPage(auth.user, membership, csrf));
});

// GET /profile - 用户个人中心
page('GET', '/profile', ({ db, req, res }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  const membership = getUserMembership(db, auth.user.id);
  const orders = getUserOrders(db, auth.user.id);
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderProfilePage(auth.user, membership, orders, csrf));
});

// ========== Workspace 直接嵌入 ==========

// GET /workspace - Workspace 入口
page('GET', '/workspace', async ({ db, req, res }) => {
  const { handleWorkspaceEntry } = await import('./gateway.ts');
  await handleWorkspaceEntry(db, req, res);
});

// GET /workspace/* - Workspace 通配代理（SPA fallback 包含在内）
page('GET', '/workspace/*', async ({ db, req, res, params }) => {
  const { handleWorkspaceProxy } = await import('./gateway.ts');
  const url = new URL(req.url ?? '/', 'http://localhost');
  await handleWorkspaceProxy(db, req, res, url.pathname);
});

// ========== 管理员会员管理 ==========

// GET /admin/membership - 管理员会员管理
page('GET', '/admin/membership', ({ db, req, res }) => {
  const user = requireAdmin(db, req, res);
  if (!user) return;
  const orders = getAllOrders(db);
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderAdminMembershipPage(user, orders, csrf));
});

// GET /admin/prices - 管理员价格管理
page('GET', '/admin/prices', ({ db, req, res }) => {
  const user = requireAdmin(db, req, res);
  if (!user) return;
  const prices = getAllMembershipPrices(db);
  const csrf = parseCookies(req)[CSRF_COOKIE] ?? '';
  sendHtml(res, 200, renderAdminPricesPage(user, prices, csrf));
});

// POST /admin/users/:id/membership - 管理员设置会员
page('POST', '/admin/users/:id/membership', async ({ db, req, res, params }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
  const form = await readForm(req);
  assertPageCsrf(req, form);
  const targetId = Number(params.id);
  const type = form.type as MembershipType;
  const days = Number(form.days) || 30;
  if (!['trial', 'monthly', 'yearly'].includes(type)) {
    redirect(res, '/admin/users');
    return;
  }
  adminSetMembership(db, actor.id, targetId, type, days);
  redirect(res, '/admin/users');
});

// ========== 路由分发 ==========

/** 处理页面请求，返回 true 表示已处理，false 表示未匹配 */
export async function handlePageRequest(db: DatabaseSync, req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
  const method = req.method as 'GET' | 'POST';
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = url.pathname;

  const auth = authenticate(db, req);

  for (const route of pageRoutes) {
    if (route.method !== method) continue;
    const params = matchPath(route.pattern, pathname);
    if (!params) continue;

    const ctx: PageCtx = { db, req, res, params, user: auth?.user ?? null };
    await route.handler(ctx);
    return true;
  }

  return false;
}

interface UserInfo {
  id: number;
  nickname: string;
  username: string;
  role: string;
  status: string;
  max_instances: number;
  max_running: number;
  created_at: number;
  last_login_at: number | null;
  membership_type: string | null;
  membership_expires_at: number | null;
}

interface AuditEntry {
  id: number;
  actor_id: number | null;
  target_user_id: number | null;
  action: string;
  detail: string | null;
  created_at: number;
}
