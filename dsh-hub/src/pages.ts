/**
 * DSH Hub · 页面路由（Web UI MVP）
 *
 * 服务端渲染页面路由，与 API 路由共存于同一 HTTP 服务。
 * GET 请求渲染 HTML 页面，POST 请求处理表单提交后重定向。
 */
import http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { escapeHtml, readForm, redirect, sendHtml } from './http.ts';
import { authenticate } from './auth.ts';
import { getSetting } from './settings.ts';
import { getUser, type UserRow } from './users.ts';
import { createSession, destroySession, SESSION_COOKIE, CSRF_COOKIE } from './sessions.ts';
import { hashPassword, verifyPassword, DUMMY_HASH } from './pwd.ts';
import { listInstances, getInstance, createInstance, deleteInstance, listAllInstances, runningCount } from './instances.ts';
import { startInstance, stopInstance, tailLog } from './supervisor.ts';
import { audit, withTx } from './db.ts';

// 页面视图
import { renderSetupPage, renderLoginPage, renderRegisterPage, renderForgotPasswordPage, renderResetPasswordPage } from './views/auth.ts';
import { renderInstancesPage, renderNewInstancePage, renderInstanceDetailPage } from './views/user.ts';
import { renderDashboardPage, renderUsersPage, renderAdminInstancesPage, renderAuditPage, renderSettingsPage } from './views/admin.ts';
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
  const secure = process.env.DSH_HUB_COOKIE_SECURE === '1' ? '; Secure' : '';
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
      const id = db.prepare(
        'INSERT INTO users (nickname, slug, dir_name, username, email, password_hash, role, status, max_instances, max_running, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(nickname, nickname.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || `u-${Date.now().toString(36)}`, nickname, finalUsername, email || null, hashPassword(password), 'admin', 'active', 3, 1, Date.now());
      user = getUser(db, id.lastInsertRowid as number)!;
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
  sendHtml(res, 200, renderLoginPage(undefined, regOpen));
});

// POST /login - 登录处理
page('POST', '/login', async ({ db, req, res }) => {
  const form = await readForm(req);
  const { account, password } = form;

  if (!account || !password) {
    sendHtml(res, 400, renderLoginPage('请填写所有必填字段'));
    return;
  }

  // 支持 username 或 email 登录
  const user = getUserByAccount(db, account);
  let valid = false;
  if (user) valid = verifyPassword(password, user.password_hash);
  else verifyPassword(password, DUMMY_HASH);

  if (!user || !valid) {
    const regOpen = getSetting(db, 'registration_open', 'closed') === 'open';
    sendHtml(res, 401, renderLoginPage('用户名/邮箱或密码错误', regOpen));
    return;
  }

  if (user.status === 'disabled') {
    sendHtml(res, 403, renderLoginPage('账号已被禁用'));
    return;
  }

  audit(db, 'login', user.id, user.id);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
  const { token, csrf } = createSession(db, user.id, null, req.headers['user-agent'] ?? null);
  setSessionCookie(res, token, csrf);

  const isAdmin = user.role === 'admin' || user.role === 'root';
  redirect(res, isAdmin ? '/admin' : '/');
});

// GET /register - 注册页面
page('GET', '/register', ({ db, res }) => {
  const regOpen = getSetting(db, 'registration_open', 'closed') === 'open';
  if (!regOpen) {
    redirect(res, '/login');
    return;
  }
  sendHtml(res, 200, renderRegisterPage());
});

// POST /register - 注册处理
page('POST', '/register', async ({ db, req, res }) => {
  const regOpen = getSetting(db, 'registration_open', 'closed') === 'open';
  if (!regOpen) {
    sendHtml(res, 403, renderRegisterPage('注册已关闭'));
    return;
  }

  const form = await readForm(req);
  const { nickname, username, email, password, password2 } = form;
  const formPreserve = { nickname, username, email };

  if (!nickname || !username || !email || !password) {
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
      const slug = nickname.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || `u-${Date.now().toString(36)}`;
      const id = db.prepare(
        'INSERT INTO users (nickname, slug, dir_name, username, email, password_hash, role, status, max_instances, max_running, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(nickname, slug, nickname, username, email, hashPassword(password), role, 'active', 3, 1, Date.now());
      user = getUser(db, id.lastInsertRowid as number)!;
    });
    audit(db, 'register', user!.id, user!.id, `registered as ${user!.role}`);
    const { token, csrf } = createSession(db, user!.id, null, null);
    setSessionCookie(res, token, csrf);
    
    // M3: 注册后自动创建并启动实例
    try {
      const instance = await createInstance(db, user!, { name: 'default' });
      const startResult = await startInstance(db, instance);
      if (startResult.status === 'running') {
        audit(db, 'instance_start', user!.id, user!.id, `auto-start after register: ${instance.id}`);
      }
    } catch (err) {
      console.error('[register] auto create instance failed:', err);
    }
    
    redirect(res, '/');
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
  const instances = listInstances(db, auth.user.id);
  sendHtml(res, 200, renderInstancesPage(auth.user, instances));
});

// GET /instances/new - 新建实例页面
page('GET', '/instances/new', ({ db, req, res }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  sendHtml(res, 200, renderNewInstancePage(auth.user));
});

// POST /instances - 创建实例
page('POST', '/instances', async ({ db, req, res }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
  const form = await readForm(req);
  try {
    await createInstance(db, auth.user, {
      name: form.name || `${auth.user.nickname} 的实例`,
      harnessVersion: form.harness_version || null,
    });
    redirect(res, '/');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendHtml(res, 400, renderNewInstancePage(auth.user, msg));
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
  sendHtml(res, 200, renderInstanceDetailPage(auth.user, inst, logs));
});

// POST /instances/:id/start - 启动实例
page('POST', '/instances/:id/start', async ({ db, req, res, params }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
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
page('POST', '/instances/:id/delete', ({ db, req, res, params }) => {
  const auth = authenticate(db, req);
  if (!auth) { redirect(res, '/login'); return; }
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
  const users = db.prepare('SELECT id, nickname, username, role, status, max_instances, max_running, created_at, last_login_at FROM users ORDER BY id').all() as unknown as UserInfo[];
  sendHtml(res, 200, renderUsersPage(user, users));
});

// POST /admin/users - 创建用户
page('POST', '/admin/users', async ({ db, req, res }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
  const form = await readForm(req);
  try {
    withTx(db, () => {
      const slug = (form.nickname || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || `u-${Date.now().toString(36)}`;
      db.prepare(
        'INSERT INTO users (nickname, slug, dir_name, email, password_hash, role, status, max_instances, max_running, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(form.nickname ?? '', slug, form.nickname ?? '', form.email || null, hashPassword(form.password ?? ''), form.role ?? 'user', 'active', 3, 1, Date.now());
    });
    audit(db, 'user_create', actor.id, null, `created user ${form.nickname}`);
    redirect(res, '/admin/users');
  } catch (e) {
    const users = db.prepare('SELECT id, nickname, role, status, max_instances, max_running, created_at, last_login_at FROM users ORDER BY id').all() as unknown as UserInfo[];
    sendHtml(res, 400, renderUsersPage(actor, users, { type: 'danger', message: '创建失败：' + (e instanceof Error ? e.message : String(e)) }));
  }
});

// POST /admin/users/:id/disable - 封禁用户
page('POST', '/admin/users/:id/disable', async ({ db, req, res, params }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
  const id = Number(params.id ?? 0);
  const target = getUser(db, id);
  if (!target) { redirect(res, '/admin/users'); return; }
  // 停止该用户所有运行中实例
  const running = db.prepare("SELECT * FROM instances WHERE owner_id = ? AND status IN ('running','starting')").all(id) as any[];
  for (const inst of running) await stopInstance(db, inst);
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run('disabled', id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(Date.now(), id);
  audit(db, 'user_disable', actor.id, id, `disabled ${target.nickname}`);
  redirect(res, '/admin/users');
});

// POST /admin/users/:id/enable - 启用用户
page('POST', '/admin/users/:id/enable', ({ db, req, res, params }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
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
  sendHtml(res, 200, renderAdminInstancesPage(user, instances));
});

// POST /admin/instances/:id/start - 管理员启动实例
page('POST', '/admin/instances/:id/start', async ({ db, req, res, params }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
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
  const instId = params.id ?? '';
  const inst = getInstance(db, instId);
  if (!inst) { redirect(res, '/admin/instances'); return; }
  await stopInstance(db, inst);
  audit(db, 'instance_stop', actor.id, inst.owner_id, `admin stop ${inst.id}`);
  redirect(res, '/admin/instances');
});

// POST /admin/instances/:id/delete - 管理员删除实例
page('POST', '/admin/instances/:id/delete', ({ db, req, res, params }) => {
  const actor = requireAdmin(db, req, res);
  if (!actor) return;
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
  sendHtml(res, 200, renderSettingsPage(user, map));
});

// POST /admin/settings - 保存设置
page('POST', '/admin/settings', async ({ db, req, res }) => {
  const user = requireAdmin(db, req, res);
  if (!user) return;
  const form = await readForm(req);
  for (const [key, value] of Object.entries(form)) {
    if (['registration_open', 'default_harness_version', 'allowed_harness_versions'].includes(key)) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
    }
  }
  audit(db, 'user_update', user.id, null, `settings updated: ${Object.keys(form).join(', ')}`);
  const settings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  sendHtml(res, 200, renderSettingsPage(user, map, { type: 'success', message: '设置已保存' }));
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
}

interface AuditEntry {
  id: number;
  actor_id: number | null;
  target_user_id: number | null;
  action: string;
  detail: string | null;
  created_at: number;
}
