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
  --primary: #3964FE;
  --primary-dark: #2a4fd4;
  --danger: #dc3545;
  --success: #28a745;
  --warning: #ffc107;
  --gray-100: #f8f9fa;
  --gray-200: #e9ecef;
  --gray-600: #6c757d;
  --gray-900: #212529;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--gray-900);
  background: var(--gray-100);
}

/* 导航栏 */
.navbar {
  background: var(--primary);
  color: white;
  padding: 0 1.5rem;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.navbar-brand {
  font-size: 1.25rem;
  font-weight: 600;
  color: white;
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
  font-size: 0.9rem;
}

.navbar-nav a:hover { color: white; }

.navbar-user {
  display: flex;
  align-items: center;
  gap: 1rem;
}

/* 容器 */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
}

/* 卡片 */
.card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.card-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--gray-200);
}

/* 按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s, transform 0.1s;
}

.btn:hover { transform: translateY(-1px); }
.btn:active { transform: translateY(0); }

.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-dark); }

.btn-danger { background: var(--danger); color: white; }
.btn-danger:hover { background: #c82333; }

.btn-success { background: var(--success); color: white; }
.btn-success:hover { background: #218838; }

.btn-secondary { background: var(--gray-200); color: var(--gray-900); }
.btn-secondary:hover { background: #dde0e3; }

.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.8rem; }

/* 表单 */
.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
  font-size: 0.875rem;
}

.form-control {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  border: 1px solid var(--gray-200);
  border-radius: 4px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.form-control:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(57, 100, 254, 0.15);
}

/* 表格 */
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--gray-200);
}

.table th {
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  color: var(--gray-600);
  background: var(--gray-100);
}

.table tbody tr:hover { background: var(--gray-100); }

/* 状态标签 */
.badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 3px;
}

.badge-success { background: #d4edda; color: #155724; }
.badge-danger { background: #f8d7da; color: #721c24; }
.badge-warning { background: #fff3cd; color: #856404; }
.badge-info { background: #d1ecf1; color: #0c5460; }
.badge-secondary { background: var(--gray-200); color: var(--gray-600); }

/* 提示框 */
.alert {
  padding: 0.75rem 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.alert-danger { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
.alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
.alert-warning { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
.alert-info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--primary);
}

.stat-label {
  font-size: 0.85rem;
  color: var(--gray-600);
  margin-top: 0.25rem;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--gray-600);
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
  background: var(--gray-900);
  color: #e9ecef;
  padding: 1rem;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.8rem;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
}

/* 认证页面居中 */
.auth-container {
  min-height: calc(100vh - 56px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-card {
  width: 100%;
  max-width: 400px;
}

.auth-title {
  text-align: center;
  margin-bottom: 1.5rem;
}

/* 响应式 */
@media (max-width: 768px) {
  .navbar { padding: 0 1rem; }
  .navbar-nav { gap: 1rem; }
  .container { padding: 1rem; }
  .stats-grid { grid-template-columns: 1fr; }
}
`;

/** 渲染导航栏 */
function renderNav(user: UserRow | null): string {
  if (!user) {
    return `
      <nav class="navbar">
        <a href="/" class="navbar-brand">DSH Hub</a>
      </nav>`;
  }

  const isAdmin = user.role === 'admin' || user.role === 'root';
  const homeLink = isAdmin ? '/admin' : '/';

  return `
    <nav class="navbar">
      <a href="${homeLink}" class="navbar-brand">DSH Hub</a>
      <div class="navbar-nav">
        ${isAdmin ? '<a href="/admin">管理后台</a>' : ''}
        ${!isAdmin ? '<a href="/">我的实例</a>' : ''}
        <div class="navbar-user">
          <span>${escapeHtml(user.nickname)} (${user.role})</span>
          <form method="POST" action="/api/auth/logout" style="display:inline">
            <input type="hidden" name="csrf" value="">
            <button type="submit" class="btn btn-sm btn-secondary">登出</button>
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
  <title>${escapeHtml(title)} - DSH Hub</title>
  <style>${CSS}</style>
</head>
<body>
  <nav class="navbar">
    <a href="/" class="navbar-brand">DSH Hub</a>
  </nav>
  <div class="auth-container">
    <div class="auth-card card">
      ${content}
    </div>
  </div>
</body>
</html>`;
}
