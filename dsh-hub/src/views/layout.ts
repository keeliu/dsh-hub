/**
 * DSH Hub · 公共布局（Web UI MVP）
 *
 * 服务端渲染 HTML 布局：header + nav + main + footer
 * 内联 CSS，零外部依赖
 */
import { escapeHtml } from '../http.ts';
import type { UserRow } from '../users.ts';

/** 公共 CSS 样式 */
export const CSS = `
:root {
  /* 主色 */
  --primary: #0066cc;
  --primary-hover: #0052a3;
  
  /* 背景色 */
  --bg-body: #ffffff;
  --bg-input: #f5f5f5;
  --bg-sidebar: #ffffff;
  --bg-navbar: #1a1a1a;
  --bg-page: #f5f5f5;
  
  /* 文字色 */
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --text-placeholder: #999999;
  --text-white: #ffffff;
  
  /* 功能色 */
  --success: #52c41a;
  --danger: #ff4d4f;
  --warning: #faad14;
  --info: #1890ff;
  
  /* 边框 */
  --border: #e8e8e8;
  
  /* 阴影 */
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.12);
  
  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 24px;
  
  /* 字体 */
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-size-base: 14px;
  --font-size-sm: 12px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;
  --font-size-xxl: 24px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg-page);
}

/* 导航栏 */
.navbar {
  background: var(--bg-navbar);
  color: var(--text-white);
  padding: 0 1.5rem;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.navbar-brand {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-white);
  text-decoration: none;
}

.navbar-nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  list-style: none;
}

.navbar-nav a {
  color: rgba(255,255,255,0.85);
  text-decoration: none;
  font-size: var(--font-size-base);
  transition: color 0.2s;
}

.navbar-nav a:hover { color: var(--text-white); }

.navbar-user {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.navbar-profile {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: white;
  text-decoration: none;
}

.navbar-profile:hover {
  opacity: 0.8;
}

.navbar-user .avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--primary);
  color: var(--text-white);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: var(--font-size-base);
}

/* 容器 */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
}

/* 卡片 */
.card {
  background: var(--bg-body);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.card-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
}

/* 按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  font-size: var(--font-size-base);
  font-weight: 500;
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s;
}

.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-elevated); }
.btn:active { transform: translateY(0); }

.btn-primary { background: var(--primary); color: var(--text-white); }
.btn-primary:hover { background: var(--primary-hover); }

.btn-danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); border-radius: var(--radius-sm); padding: 0.25rem 0.75rem; font-size: var(--font-size-sm); }
.btn-danger:hover { background: var(--danger); color: var(--text-white); }

.btn-success { background: var(--success); color: var(--text-white); }
.btn-success:hover { background: #389e0d; }

.btn-secondary { background: var(--bg-input); color: var(--text-primary); }
.btn-secondary:hover { background: #ebebeb; }

.btn-sm { padding: 0.5rem 1rem; font-size: var(--font-size-sm); }
.btn-block { width: 100%; }

/* 表单 */
.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  font-size: var(--font-size-base);
  color: var(--text-primary);
}

.form-control {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: var(--font-size-base);
  background: var(--bg-input);
  border: none;
  border-radius: var(--radius-full);
  color: var(--text-primary);
  transition: all 0.2s;
}

.form-control::placeholder {
  color: var(--text-placeholder);
}

.form-control:focus {
  outline: none;
  background: #ebebeb;
}

select.form-control {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 1rem center;
  padding-right: 2.5rem;
}

/* 表格 */
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.table th {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  background: var(--bg-page);
}

.table tbody tr:hover { background: var(--bg-page); }

/* 状态标签 */
.badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  font-size: var(--font-size-sm);
  font-weight: 500;
  border-radius: var(--radius-sm);
}

.badge-success { background: #f6ffed; color: var(--success); }
.badge-danger { background: #fff2f0; color: var(--danger); }
.badge-warning { background: #fffbe6; color: var(--warning); }
.badge-info { background: #e6f7ff; color: var(--info); }
.badge-primary { background: #e6f7ff; color: var(--primary); }
.badge-secondary { background: var(--bg-input); color: var(--text-secondary); }

/* 提示框 */
.alert {
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.alert-danger { background: #fff2f0; color: var(--danger); border: 1px solid #ffccc7; }
.alert-success { background: #f6ffed; color: var(--success); border: 1px solid #b7eb8f; }
.alert-warning { background: #fffbe6; color: var(--warning); border: 1px solid #ffe58f; }
.alert-info { background: #e6f7ff; color: var(--info); border: 1px solid #91d5ff; }

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: var(--bg-body);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  box-shadow: var(--shadow-card);
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--primary);
}

.stat-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-secondary);
}

.empty-state-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

/* 操作栏 */
.actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

/* 日志区域 */
.log-viewer {
  background: var(--bg-navbar);
  color: #e9ecef;
  padding: 1rem;
  border-radius: var(--radius-md);
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: var(--font-size-sm);
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
}

/* 认证页面居中 */
.auth-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-body);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  background: var(--bg-body);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elevated);
  padding: 2rem;
}

.auth-title {
  text-align: center;
  margin-bottom: 0.5rem;
  font-size: var(--font-size-xxl);
  font-weight: 600;
  color: var(--text-primary);
}

.auth-subtitle {
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-base);
  margin-bottom: 1.5rem;
}

.auth-footer {
  text-align: center;
  margin-top: 1rem;
  font-size: var(--font-size-base);
  color: var(--text-secondary);
}

.auth-footer a {
  color: var(--primary);
  text-decoration: none;
}

.auth-footer a:hover { text-decoration: underline; }

/* 管理后台布局 */
.admin-layout {
  display: flex;
  min-height: calc(100vh - 56px);
}

.admin-sidebar {
  width: 200px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  padding: 1rem 0;
}

.admin-sidebar a {
  display: block;
  padding: 0.75rem 1.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: var(--font-size-base);
  transition: all 0.2s;
}

.admin-sidebar a:hover {
  background: var(--bg-page);
  color: var(--text-primary);
}

.admin-sidebar a.active {
  background: #e6f7ff;
  color: var(--primary);
  font-weight: 500;
}

.admin-content {
  flex: 1;
  padding: 1.5rem;
  background: var(--bg-page);
}

/* 会员卡片 */
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}

.pricing-card {
  background: var(--bg-body);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 2rem 1.5rem;
  border: 2px solid var(--border);
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
}

.pricing-card:hover {
  box-shadow: var(--shadow-elevated);
  transform: translateY(-2px);
}

.pricing-card-featured {
  border-color: var(--primary);
  position: relative;
}

.pricing-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.25rem 1rem;
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  font-weight: 500;
  background: var(--primary);
  color: var(--text-white);
}

.pricing-header {
  text-align: center;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1.5rem;
}

.pricing-name {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.75rem;
}

.pricing-price {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.pricing-currency {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.pricing-amount {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.pricing-desc {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  margin: 0;
}

.pricing-features {
  list-style: none;
  margin-bottom: 1.5rem;
  flex: 1;
}

.pricing-features li {
  padding: 0.5rem 0;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--font-size-base);
}

.pricing-features li::before {
  content: '✓';
  color: var(--primary);
  font-weight: 600;
}

/* 按钮轮廓样式 */
.btn-outline-primary {
  background: transparent;
  color: var(--primary);
  border: 1px solid var(--primary);
}

.btn-outline-primary:hover {
  background: var(--primary);
  color: var(--text-white);
}

/* 页面头部 */
.page-header {
  margin-bottom: 1.5rem;
}

.page-title {
  font-size: var(--font-size-xxl);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.5rem;
}

.page-subtitle {
  color: var(--text-secondary);
  font-size: var(--font-size-base);
  margin: 0;
}

/* 会员状态 */
.membership-status {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-radius: var(--radius-md);
}

.membership-active {
  background: #f6ffed;
  border: 1px solid #b7eb8f;
}

.membership-inactive {
  background: #fff2f0;
  border: 1px solid #ffccc7;
}

.membership-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 600;
}

.membership-active .membership-icon {
  background: var(--success);
  color: var(--text-white);
}

.membership-inactive .membership-icon {
  background: var(--danger);
  color: var(--text-white);
}

.membership-info {
  flex: 1;
}

.membership-type {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.membership-expires {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

/* 个人信息 */
.profile-info {
  padding: 0.5rem 0;
}

.profile-row {
  display: flex;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
}

.profile-row:last-child {
  border-bottom: none;
}

.profile-label {
  width: 120px;
  color: var(--text-secondary);
  font-size: var(--font-size-base);
}

.profile-value {
  flex: 1;
  color: var(--text-primary);
  font-weight: 500;
}

/* 支付弹窗 */
.payment-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.payment-modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
}

.payment-modal-content {
  position: relative;
  background: var(--bg-body);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elevated);
  padding: 2rem;
  min-width: 320px;
  max-width: 400px;
  text-align: center;
}

.payment-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.payment-modal-header h3 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
}

.payment-modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0;
  line-height: 1;
}

.payment-loading {
  padding: 2rem 0;
}

.payment-loading .spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  margin: 0 auto 1rem;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.payment-amount {
  font-size: var(--font-size-lg);
  margin-bottom: 1rem;
}

.payment-amount strong {
  color: var(--primary);
  font-size: var(--font-size-xl);
}

.qrcode-img {
  margin: 1rem auto;
  padding: 1rem;
  background: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  display: inline-block;
}

.qrcode-img img {
  display: block;
}

.payment-hint {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  margin: 1rem 0;
}

.payment-status {
  margin-top: 1rem;
}

#payment-waiting {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.payment-error {
  padding: 1rem 0;
}

.payment-error .error-text {
  color: var(--danger);
  margin-bottom: 1rem;
}

/* 响应式 */
@media (max-width: 768px) {
  .navbar { padding: 0 1rem; }
  .navbar-nav { gap: 1rem; }
  .container { padding: 1rem; }
  .stats-grid { grid-template-columns: 1fr; }
  .pricing-grid { grid-template-columns: 1fr; }
  .admin-sidebar { display: none; }
}
`;

/** 渲染导航栏 */
function renderNav(user: UserRow | null): string {
  if (!user) {
    return `
      <nav class="navbar">
        <a href="/" class="navbar-brand">乌鸦 work</a>
      </nav>`;
  }

  const isAdmin = user.role === 'admin' || user.role === 'root';
  const homeLink = isAdmin ? '/admin' : '/';
  const initial = user.nickname.charAt(0).toUpperCase();

  return `
    <nav class="navbar">
      <a href="${homeLink}" class="navbar-brand">乌鸦 work</a>
      <div class="navbar-nav">
        ${!isAdmin ? '<a href="/">智能体</a>' : ''}
        ${isAdmin ? '<a href="/admin">系统管理</a>' : ''}
        <div class="navbar-user">
          <a href="/profile" class="navbar-profile">
            <div class="avatar">${initial}</div>
            <span>${escapeHtml(user.nickname)}</span>
          </a>
          <form method="POST" action="/api/auth/logout" style="display:inline">
            <input type="hidden" name="csrf" value="">
            <button type="submit" class="btn btn-sm" style="background:transparent;color:white;border:1px solid rgba(255,255,255,0.3);border-radius:4px;padding:4px 12px;font-size:12px;">登出</button>
          </form>
        </div>
      </div>
    </nav>`;
}

/** 渲染页面布局 */
/** CSRF 隐藏字段 */
export function csrfField(csrf: string): string {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">`;
}

export function layout(title: string, content: string, user: UserRow | null, flash?: { type: string; message: string }, csrf?: string): string {
  const flashHtml = flash ? `<div class="alert alert-${flash.type}">${escapeHtml(flash.message)}</div>` : '';
  const csrfMeta = csrf ? `<meta name="csrf-token" content="${escapeHtml(csrf)}">` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${csrfMeta}
  <title>${escapeHtml(title)} - DSH Hub</title>
  <style>${CSS}</style>
</head>
<body>
  ${renderNav(user)}
  <div class="container">
    ${flashHtml}
    ${content}
  </div>
</body>
</html>`;
}

/** 渲染认证页面布局（无导航栏） */
export function authLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - 乌鸦 work</title>
  <style>${CSS}${AUTH_CSS}</style>
</head>
<body class="auth-body">
  <div class="auth-page">
    <div class="auth-card">
      ${content}
    </div>
  </div>
</body>
</html>`;
}

/** 认证页面专用样式 */
const AUTH_CSS = `
.auth-body {
  background: #ffffff;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
}
.auth-page {
  width: 100%;
  max-width: 400px;
}
.auth-card {
  background: #ffffff;
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  padding: 2.5rem 2rem;
}
.auth-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #000;
  text-align: center;
  margin: 0 0 0.5rem;
}
.auth-subtitle {
  font-size: 0.875rem;
  color: var(--gray-600);
  text-align: center;
  margin: 0 0 1.5rem;
}
.auth-card .form-group {
  margin-bottom: 1rem;
}
.auth-card .form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #333;
  margin-bottom: 0.5rem;
}
.auth-card .form-control {
  width: 100%;
  padding: 0.75rem 1rem;
  background: #f5f5f5;
  border: none;
  border-radius: var(--radius-pill);
  font-size: 0.875rem;
  color: #333;
  box-sizing: border-box;
  transition: background 0.2s, box-shadow 0.2s;
}
.auth-card .form-control:focus {
  outline: none;
  background: #f0f0f0;
  box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
}
.auth-card .form-control::placeholder {
  color: #999;
}
.auth-card .btn-primary {
  margin-top: 0.5rem;
}
.auth-footer {
  text-align: center;
  margin-top: 1.25rem;
  font-size: 0.875rem;
  color: var(--gray-600);
}
.auth-footer a {
  color: var(--primary);
  text-decoration: none;
}
.auth-footer a:hover {
  text-decoration: underline;
}
`;
