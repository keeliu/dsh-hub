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
    <h1 class="auth-title">首次设置</h1>
    <p class="auth-subtitle">创建管理员账号以开始使用乌鸦 work</p>
    ${errorHtml}
    <form method="POST" action="/setup">
      <div class="form-group">
        <label class="form-label" for="nickname">昵称</label>
        <input type="text" id="nickname" name="nickname" class="form-control" required autofocus placeholder="输入昵称">
      </div>
      <div class="form-group">
        <label class="form-label" for="username">用户名（登录账号）</label>
        <input type="text" id="username" name="username" class="form-control" placeholder="用于登录的账号名">
      </div>
      <div class="form-group">
        <label class="form-label" for="email">邮箱（可选）</label>
        <input type="email" id="email" name="email" class="form-control" placeholder="用于找回密码">
      </div>
      <div class="form-group">
        <label class="form-label" for="password">密码</label>
        <input type="password" id="password" name="password" class="form-control" required minlength="8" placeholder="至少 8 个字符">
      </div>
      <div class="form-group">
        <label class="form-label" for="password2">确认密码</label>
        <input type="password" id="password2" name="password2" class="form-control" required placeholder="再次输入密码">
      </div>
      <button type="submit" class="btn btn-primary btn-block">创建管理员</button>
    </form>
  `;

  return authLayout('首次设置', content);
}

/** 登录页面（/login） */
export function renderLoginPage(error?: string, registrationOpen = false): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';
  const registerLink = registrationOpen
    ? '<div class="auth-footer">没有账号？<a href="/register">立即注册</a></div>'
    : '';

  const content = `
    <h1 class="auth-title">欢迎回来</h1>
    <p class="auth-subtitle">登录乌鸦 work 个人 AI 工作台</p>
    ${errorHtml}
    <form method="POST" action="/login">
      <div class="form-group">
        <label class="form-label" for="account">用户名 / 邮箱</label>
        <input type="text" id="account" name="account" class="form-control" required autofocus placeholder="输入用户名或邮箱">
      </div>
      <div class="form-group">
        <label class="form-label" for="password">密码</label>
        <input type="password" id="password" name="password" class="form-control" required placeholder="输入密码">
      </div>
      <button type="submit" class="btn btn-primary btn-block">登录</button>
    </form>
    <div class="auth-footer">
      <a href="/forgot-password">忘记密码？</a>
      <span style="margin:0 0.5rem;color:var(--border)">|</span>
      <a href="/register">没有账号？立即注册</a>
    </div>
    ${registerLink}
  `;

  return authLayout('登录', content);
}

/** 注册页面（/register） */
export function renderRegisterPage(error?: string, form?: { nickname?: string; username?: string; email?: string }): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';
  const nicknameValue = form?.nickname ? ` value="${escapeHtml(form.nickname)}"` : '';
  const usernameValue = form?.username ? ` value="${escapeHtml(form.username)}"` : '';
  const emailValue = form?.email ? ` value="${escapeHtml(form.email)}"` : '';

  const content = `
    <h1 class="auth-title">创建账号</h1>
    <p class="auth-subtitle">加入乌鸦 work 个人 AI 工作台</p>
    ${errorHtml}
    <form method="POST" action="/register">
      <div class="form-group">
        <label class="form-label" for="nickname">用户名</label>
        <input type="text" id="nickname" name="nickname" class="form-control" required autofocus placeholder="输入用户名"${nicknameValue}>
      </div>
      <div class="form-group">
        <label class="form-label" for="email">邮箱</label>
        <input type="email" id="email" name="email" class="form-control" required placeholder="输入邮箱"${emailValue}>
      </div>
      <div class="form-group">
        <label class="form-label" for="password">密码</label>
        <input type="password" id="password" name="password" class="form-control" required minlength="8" placeholder="输入密码">
      </div>
      <div class="form-group">
        <label class="form-label" for="password2">确认密码</label>
        <input type="password" id="password2" name="password2" class="form-control" required placeholder="再次输入密码">
      </div>
      <button type="submit" class="btn btn-primary btn-block">注册</button>
    </form>
    <div class="auth-footer">
      已有账号？<a href="/login">立即登录</a>
    </div>
  `;

  return authLayout('注册', content);
}

/** 找回密码页面（/forgot-password） */
export function renderForgotPasswordPage(error?: string, success?: string): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';
  const successHtml = success ? `<div class="alert alert-success">${escapeHtml(success)}</div>` : '';

  const content = `
    <h1 class="auth-title">忘记密码</h1>
    <p class="auth-subtitle">输入注册邮箱，我们将发送重置链接</p>
    ${errorHtml}
    ${successHtml}
    <form method="POST" action="/forgot-password">
      <div class="form-group">
        <label class="form-label" for="email">注册邮箱</label>
        <input type="email" id="email" name="email" class="form-control" required autofocus placeholder="输入注册时使用的邮箱">
      </div>
      <button type="submit" class="btn btn-primary btn-block">发送重置链接</button>
    </form>
    <div class="auth-footer">
      <a href="/login">返回登录</a>
    </div>
  `;

  return authLayout('找回密码', content);
}

/** 重置密码页面（/reset-password） */
export function renderResetPasswordPage(email: string, error?: string): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';

  const content = `
    <h1 class="auth-title">重置密码</h1>
    <p class="auth-subtitle">验证码已发送至 <strong>${escapeHtml(email)}</strong></p>
    ${errorHtml}
    <form method="POST" action="/reset-password">
      <input type="hidden" name="email" value="${escapeHtml(email)}">
      <div class="form-group">
        <label class="form-label" for="code">验证码</label>
        <input type="text" id="code" name="code" class="form-control" required autofocus placeholder="输入6位验证码" maxlength="6" pattern="[0-9]{6}">
      </div>
      <div class="form-group">
        <label class="form-label" for="password">新密码</label>
        <input type="password" id="password" name="password" class="form-control" required minlength="8" placeholder="输入新密码">
      </div>
      <div class="form-group">
        <label class="form-label" for="password2">确认新密码</label>
        <input type="password" id="password2" name="password2" class="form-control" required placeholder="再次输入新密码">
      </div>
      <button type="submit" class="btn btn-primary btn-block">重置密码</button>
    </form>
    <div class="auth-footer">
      <a href="/forgot-password">重新发送验证码</a>
    </div>
  `;

  return authLayout('重置密码', content);
}
