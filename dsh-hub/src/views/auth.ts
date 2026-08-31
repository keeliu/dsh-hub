/**
 * DSH Hub · 认证页面（Web UI MVP）
 *
 * 首启向导 / 登录 / 注册 页面渲染
 */
import { escapeHtml } from '../http.ts';
import { authLayout } from './layout.ts';

/** 首启向导页面（/setup） */
export function renderSetupPage(error?: string): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';

  const content = `
    <h2 class="auth-title">首次设置</h2>
    <p style="text-align:center;color:var(--gray-600);margin-bottom:1.5rem">
      创建管理员账号以开始使用 DSH Hub
    </p>
    ${errorHtml}
    <form method="POST" action="/setup">
      <div class="form-group">
        <label class="form-label" for="nickname">昵称</label>
        <input type="text" id="nickname" name="nickname" class="form-control" required autofocus>
      </div>
      <div class="form-group">
        <label class="form-label" for="email">邮箱（可选）</label>
        <input type="email" id="email" name="email" class="form-control">
      </div>
      <div class="form-group">
        <label class="form-label" for="password">密码</label>
        <input type="password" id="password" name="password" class="form-control" required minlength="8">
        <small style="color:var(--gray-600)">至少 8 个字符</small>
      </div>
      <div class="form-group">
        <label class="form-label" for="password2">确认密码</label>
        <input type="password" id="password2" name="password2" class="form-control" required>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%">创建管理员</button>
    </form>
  `;

  return authLayout('首次设置', content);
}

/** 登录页面（/login） */
export function renderLoginPage(error?: string, registrationOpen = false): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';
  const registerLink = registrationOpen
    ? '<p style="text-align:center;margin-top:1rem"><a href="/register">没有账号？立即注册</a></p>'
    : '';

  const content = `
    <h2 class="auth-title">登录</h2>
    ${errorHtml}
    <form method="POST" action="/login">
      <div class="form-group">
        <label class="form-label" for="nickname">昵称</label>
        <input type="text" id="nickname" name="nickname" class="form-control" required autofocus>
      </div>
      <div class="form-group">
        <label class="form-label" for="password">密码</label>
        <input type="password" id="password" name="password" class="form-control" required>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%">登录</button>
    </form>
    ${registerLink}
  `;

  return authLayout('登录', content);
}

/** 注册页面（/register） */
export function renderRegisterPage(error?: string): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';

  const content = `
    <h2 class="auth-title">注册</h2>
    ${errorHtml}
    <form method="POST" action="/register">
      <div class="form-group">
        <label class="form-label" for="nickname">昵称</label>
        <input type="text" id="nickname" name="nickname" class="form-control" required autofocus>
      </div>
      <div class="form-group">
        <label class="form-label" for="email">邮箱（可选）</label>
        <input type="email" id="email" name="email" class="form-control">
      </div>
      <div class="form-group">
        <label class="form-label" for="password">密码</label>
        <input type="password" id="password" name="password" class="form-control" required minlength="8">
        <small style="color:var(--gray-600)">至少 8 个字符</small>
      </div>
      <div class="form-group">
        <label class="form-label" for="password2">确认密码</label>
        <input type="password" id="password2" name="password2" class="form-control" required>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%">注册</button>
    </form>
    <p style="text-align:center;margin-top:1rem"><a href="/login">已有账号？立即登录</a></p>
  `;

  return authLayout('注册', content);
}
