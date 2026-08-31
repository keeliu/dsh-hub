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
        <label class="form-label" for="username">用户名（登录账号）</label>
        <input type="text" id="username" name="username" class="form-control" required placeholder="用于登录的账号名">
        <small style="color:var(--gray-600)">留空则使用昵称作为用户名</small>
      </div>
      <div class="form-group">
        <label class="form-label" for="email">邮箱（可选）</label>
        <input type="email" id="email" name="email" class="form-control" placeholder="用于找回密码">
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
        <label class="form-label" for="account">用户名 / 邮箱</label>
        <input type="text" id="account" name="account" class="form-control" required autofocus placeholder="输入用户名或邮箱">
      </div>
      <div class="form-group">
        <label class="form-label" for="password">密码</label>
        <input type="password" id="password" name="password" class="form-control" required>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%">登录</button>
    </form>
    <p style="text-align:center;margin-top:1rem">
      <a href="/forgot-password">忘记密码？</a>
    </p>
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
        <input type="text" id="nickname" name="nickname" class="form-control" required autofocus placeholder="显示名称">
      </div>
      <div class="form-group">
        <label class="form-label" for="username">用户名</label>
        <input type="text" id="username" name="username" class="form-control" required placeholder="3-32位字母数字下划线">
        <small style="color:var(--gray-600)">用于登录，3-32位字母、数字或下划线</small>
      </div>
      <div class="form-group">
        <label class="form-label" for="email">邮箱</label>
        <input type="email" id="email" name="email" class="form-control" required placeholder="用于找回密码">
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

/** 找回密码页面（/forgot-password） */
export function renderForgotPasswordPage(error?: string, success?: string): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';
  const successHtml = success ? `<div class="alert alert-success">${escapeHtml(success)}</div>` : '';

  const content = `
    <h2 class="auth-title">找回密码</h2>
    ${errorHtml}
    ${successHtml}
    <form method="POST" action="/forgot-password">
      <div class="form-group">
        <label class="form-label" for="email">注册邮箱</label>
        <input type="email" id="email" name="email" class="form-control" required autofocus placeholder="输入注册时使用的邮箱">
        <small style="color:var(--gray-600)">我们将发送验证码到此邮箱</small>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%">发送验证码</button>
    </form>
    <p style="text-align:center;margin-top:1rem"><a href="/login">返回登录</a></p>
  `;

  return authLayout('找回密码', content);
}

/** 重置密码页面（/reset-password） */
export function renderResetPasswordPage(email: string, error?: string): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';

  const content = `
    <h2 class="auth-title">重置密码</h2>
    ${errorHtml}
    <p style="text-align:center;color:var(--gray-600);margin-bottom:1.5rem">
      验证码已发送至 <strong>${escapeHtml(email)}</strong>
    </p>
    <form method="POST" action="/reset-password">
      <input type="hidden" name="email" value="${escapeHtml(email)}">
      <div class="form-group">
        <label class="form-label" for="code">验证码</label>
        <input type="text" id="code" name="code" class="form-control" required autofocus placeholder="输入6位验证码" maxlength="6" pattern="[0-9]{6}">
        <small style="color:var(--gray-600)">验证码 10 分钟内有效</small>
      </div>
      <div class="form-group">
        <label class="form-label" for="password">新密码</label>
        <input type="password" id="password" name="password" class="form-control" required minlength="8">
        <small style="color:var(--gray-600)">至少 8 个字符</small>
      </div>
      <div class="form-group">
        <label class="form-label" for="password2">确认新密码</label>
        <input type="password" id="password2" name="password2" class="form-control" required>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%">重置密码</button>
    </form>
    <p style="text-align:center;margin-top:1rem"><a href="/forgot-password">重新发送验证码</a></p>
  `;

  return authLayout('重置密码', content);
}
