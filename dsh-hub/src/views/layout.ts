/**
 * DSH Hub · 公共布局（Web UI MVP）
 *
 * 服务端渲染 HTML 布局：header + nav + main + footer
 * 内联 CSS，零外部依赖
 */
import { escapeHtml } from '../http.ts';
import { BASE_STYLES } from './styles/base.ts';
import { csrfField, flashHtml } from './components.ts';
import { renderNav } from './nav.ts';
import { REDUCED_MOTION_CSS, TOKENS_CSS } from './styles/tokens.ts';
import type { UserRow } from '../users.ts';

/**
 * 样式装配点：令牌 → 基础层 → 降级规则。
 *
 * 三个来源各司其职（`design.md` §10.2）：
 *   `styles/tokens.ts`    —— 唯一颜色 / 尺寸来源
 *   `styles/base.ts`      —— 可访问性基线与全局重置
 *   `styles/tokens.ts` 的降级规则 —— `prefers-reduced-motion`
 * 注入顺序固定为「令牌 → 基础 → 组件」，组件样式因此总在最后，
 * 且所有页面都经由同一个 `BASE_CSS`，不会出现拿到部分样式的分叉。
 */
export const BASE_CSS = `${TOKENS_CSS}${BASE_STYLES}${REDUCED_MOTION_CSS}`;

/** 公共 CSS 样式（组件与页面层；令牌见 `styles/tokens.ts`） */
export const CSS = `
/* 导航栏 */
/* 顶栏：高度基准 --layout-topbar-height，全站唯一（design.md §3.12） */
.navbar {
  background: var(--brand-primary);
  color: var(--text-inverse);
  padding: 0 var(--space-5);
  height: var(--layout-topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: var(--shadow-hover);
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
  color: rgb(255 255 255 / 85%);
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
  font-size: 14px;
}

/* 用户下拉菜单 */
.user-dropdown {
  position: relative;
}

.user-dropdown-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: var(--font-size-base);
}

.user-dropdown-toggle:hover {
  background: rgb(255 255 255 / 10%);
}

.user-dropdown-menu {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: white;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-elevated);
  min-width: 160px;
  overflow: hidden;
  z-index: 10000;
  border: 1px solid var(--border);
}

.dropdown-item {
  display: block;
  padding: 0.75rem 1rem;
  color: var(--text-title);
  text-decoration: none;
  font-size: var(--font-size-base);
  transition: background 0.2s;
  background: white;
}

.dropdown-item:hover {
  background: var(--surface-hover);
  color: var(--text-title);
}

.dropdown-item-danger {
  color: var(--state-danger);
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-base);
  padding: 0.75rem 1rem;
}

.dropdown-item-danger:hover {
  background: var(--state-danger-hover-bg);
}

.dropdown-divider {
  height: 1px;
  background: var(--border);
  margin: 0.25rem 0;
}

/* 容器 - 普通页面使用居中留白布局（原为全属性 !important，导致任何后续覆盖都失效） */
.container {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-5);
}

/* Workspace 页面使用满屏布局（高度基准统一为 --layout-topbar-height） */
.workspace-container {
  max-width: 100%;
  margin: 0;
  padding: 0;
  height: calc(100vh - var(--layout-topbar-height));
  height: calc(100dvh - var(--layout-topbar-height));
  overflow: hidden;
}

/* 卡片：浅灰填充、无边框无阴影（design.md §3.1 / §5.2） */
.card {
  background: var(--surface-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-none);
  padding: var(--space-5);
  margin-bottom: var(--space-5);
}

/* 卡片标题（design.md §5.2：卡片内不用分割线，靠间距分组） */
.card-title {
  font-size: var(--fs-section);
  font-weight: var(--fw-section);
  margin-bottom: var(--space-4);
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
  border-radius: var(--radius-md);
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s;
}

.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-elevated); }
.btn:active { transform: translateY(0); }

/* 主按钮 = 黑底白字（design.md §3.4：黑只用于动作） */
.btn-primary { background: var(--brand-primary); color: var(--text-inverse); }
.btn-primary:hover { background: var(--brand-primary-hover); }

.btn-danger { background: transparent; color: var(--state-danger); border: 1px solid var(--state-danger); border-radius: var(--radius-md); padding: 0.25rem 0.75rem; font-size: var(--font-size-sm); }
.btn-danger:hover { background: var(--danger); color: var(--text-white); }

.btn-success { background: var(--state-success); color: var(--text-inverse); }
.btn-success:hover { background: var(--state-success-hover); }

.btn-secondary { background: var(--surface-card); color: var(--text-title); }
.btn-secondary:hover { background: var(--surface-ui-hover); }

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

.form-hint {
  margin: var(--space-1) 0 0;
  font-size: var(--fs-caption);
  line-height: 1.5;
  color: var(--text-secondary);
  max-width: 560px;
}

.form-control {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: var(--font-size-base);
  background: var(--surface-card);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-title);
  transition: background var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}

.form-control::placeholder {
  color: var(--text-tertiary);
}

/* 输入框聚焦：outline:none 必须配可见替代（design.md §9 强制） */
.form-control:focus {
  outline: none;
  background: var(--surface-card);
  border-color: var(--brand-accent);
  box-shadow: var(--focus-ring);
}

select.form-control {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 1rem center;
  padding-right: 2.5rem;
}

/* 表格 */
/* 溢出容器：窄屏表格横向滚动而不是撑破整页（design.md §5.9 强制） */
.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
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

.badge-success { background: var(--badge-success-bg); color: var(--badge-success-fg); }
.badge-danger { background: var(--badge-danger-bg); color: var(--badge-danger-fg); }
.badge-warning { background: var(--badge-warning-bg); color: var(--badge-warning-fg); }
.badge-info { background: var(--badge-info-bg); color: var(--badge-info-fg); }
.badge-primary { background: var(--badge-info-bg); color: var(--badge-info-fg); }
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

.alert-danger { background: var(--badge-danger-bg); color: var(--badge-danger-fg); border: 1px solid var(--state-danger); }
.alert-success { background: var(--badge-success-bg); color: var(--badge-success-fg); border: 1px solid var(--state-success); }
.alert-warning { background: var(--badge-warning-bg); color: var(--badge-warning-fg); border: 1px solid var(--state-warning); }
.alert-info { background: var(--badge-info-bg); color: var(--badge-info-fg); border: 1px solid var(--state-info); }

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
  background: var(--code-bg);
  color: var(--code-fg);
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
  min-height: calc(100vh - var(--layout-topbar-height));
  min-height: calc(100dvh - var(--layout-topbar-height));
  max-width: 100%;
}

/* 侧栏宽度与主骨架共用同一令牌；原 200px 与其他页面不一致 */
.admin-sidebar {
  width: var(--layout-sidebar-width);
  background: var(--surface-sunken);
  border-right: 1px solid var(--border-hairline);
  padding: 1rem 0;
  flex-shrink: 0;
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
  background: var(--brand-accent-soft);
  color: var(--brand-accent-strong);
  font-weight: 500;
}

.admin-content {
  flex: 1;
  padding: var(--space-6) var(--space-5);
  background: var(--surface-canvas);
  min-width: 0;
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
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.pricing-original {
  font-size: var(--font-size-base);
  color: var(--color-text-tertiary);
  text-decoration: line-through;
}

.pricing-amount-free {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--color-primary);
}

.pricing-currency {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.pricing-amount {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--state-danger);
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
  background: var(--badge-success-bg);
  border: 1px solid var(--state-success);
}

.membership-inactive {
  background: var(--badge-danger-bg);
  border: 1px solid var(--state-danger);
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

/* 会员徽章（P0 修复：/profile 与 /payment/return 引用但此前未定义） */
.membership-badge {
  display: inline-block;
  padding: 0.125rem 0.625rem;
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  font-weight: 600;
  line-height: 1.6;
}

.membership-badge.trial {
  background: var(--badge-info-bg);
  color: var(--badge-info-fg);
}

.membership-badge.monthly {
  background: var(--badge-success-bg);
  color: var(--badge-success-fg);
}

.membership-badge.yearly {
  background: var(--badge-warning-bg);
  color: var(--badge-warning-fg);
}

.membership-badge.expired {
  background: var(--bg-input);
  color: var(--text-secondary);
}

/* 支付返回页（P0 修复：整页类此前均未定义） */
.payment-return {
  text-align: center;
  padding: 2rem 1rem;
}

.payment-return-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--success);
  color: var(--text-white);
  font-size: 1.75rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.payment-return-desc {
  color: var(--text-secondary);
  font-size: var(--font-size-base);
  margin: 0.5rem 0 0;
}

.payment-return-icon--pending {
  background: var(--warning);
}

/* 支付弹窗二维码区（P0 修复：此前未定义） */
.payment-qrcode {
  margin-top: 0.5rem;
}

.payment-return-actions {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 2rem;
}

/* 价格设置表单（P0 修复：/admin/prices 的 price-*/input-* 此前未定义） */
.price-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-top: 0.5rem;
}

.price-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.price-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.input-group {
  display: flex;
  align-items: stretch;
}

.input-group .form-control {
  border-radius: 0;
  min-width: 0;
  flex: 1;
}

.input-prefix,
.input-suffix {
  display: flex;
  align-items: center;
  padding: 0 0.625rem;
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.input-prefix {
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.input-suffix {
  border-left: none;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

/* 预置插件清单（P0 修复：pj-* 此前未定义，包名输入框在表格内被压到最小宽度） */
.pj-spec {
  min-width: 240px;
}

.pj-enabled,
.pj-allow,
.pj-ws {
  cursor: pointer;
}

/* 预置插件行的操作按钮（P0 修复：↑ / ↓ / 删除 此前无样式，按钮在 actions 列内挤成一行） */
.pj-up,
.pj-down {
  min-width: 2rem;
  font-weight: 600;
}

.pj-del {
  white-space: nowrap;
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
  background: var(--scrim);
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

.payment-countdown {
  margin-top: 0.75rem;
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.payment-countdown strong {
  color: var(--color-error);
  font-size: var(--font-size-lg);
  margin-left: 0.25rem;
}

.payment-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.25rem;
  justify-content: center;
}

.payment-actions .btn {
  flex: 1;
  max-width: 140px;
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

/* 窄屏导航抽屉按钮：桌面端不显示 */
.navbar-toggle {
  display: none;
  background: transparent;
  border: 1px solid rgb(255 255 255 / 35%);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  font-size: 1rem;
  line-height: 1;
  padding: 0.5rem 0.65rem;
  cursor: pointer;
}

/* 响应式 */
@media (max-width: 768px) {
  .navbar { padding: 0 var(--space-4); }
  .navbar-toggle { display: inline-flex; }
  /* 原实现是 .navbar-nav { gap: 1rem } 直接溢出，改为下拉抽屉 */
  .navbar-nav {
    position: absolute;
    top: var(--layout-topbar-height);
    left: 0;
    right: 0;
    z-index: var(--z-dropdown);
    display: none;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    background: var(--surface-canvas);
    border-bottom: 1px solid var(--border-hairline);
    box-shadow: var(--shadow-float);
    padding: var(--space-2);
  }
  .navbar-nav.is-open { display: flex; }
  .navbar-nav > a {
    color: var(--text-body);
    padding: var(--space-3) var(--space-3);
    border-radius: var(--radius-md);
  }
  .navbar-nav > a:hover { background: var(--surface-hover); }
  .navbar-user { margin-left: 0; }
  .user-dropdown { width: 100%; }
  .user-dropdown-toggle { width: 100%; justify-content: flex-start; }
  .user-dropdown-menu { position: static; width: 100%; box-shadow: var(--shadow-none); }
  .container { padding: var(--space-4); }
  .stats-grid { grid-template-columns: 1fr; }
  .pricing-grid { grid-template-columns: 1fr; }
  /* 侧栏改为横向可滚动条，替代原先直接 display:none（等于没有导航） */
  .admin-layout { flex-direction: column; }
  .admin-sidebar {
    width: 100%;
    display: flex;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--border-hairline);
    padding: 0;
  }
  .admin-sidebar a {
    white-space: nowrap;
    padding: var(--space-3) var(--space-4);
  }
  .admin-content { padding: var(--space-4); }
}
`;

/** 渲染页面布局 */
/* csrfField 已迁至 ./components.ts（单点实现），此处保留再导出避免改动既有导入 */
export { csrfField };

/**
 * 实例处于 starting / stopping 时自动刷新页面。
 * 启动的后半段可能很长（首次装插件树要经 npx 下载数百 MB，见 supervisor/spawn.ts::startInstance），
 * 页面需要在后台准备期间自己跟上状态，而不是让用户手动刷新。
 */
export function statusAutoRefreshScript(): string {
  return `<script>
(function () {
  var t = document.body ? (document.body.textContent || '') : '';
  if (t.indexOf('starting') === -1 && t.indexOf('stopping') === -1) return;
  setTimeout(function () { window.location.reload(); }, 3000);
})();
</script>`;
}

export function layout(title: string, content: string, user: UserRow | null, flash?: { type: string; message: string }, csrf?: string): string {
  const csrfMeta = csrf ? `<meta name="csrf-token" content="${escapeHtml(csrf)}">` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${csrfMeta}
  <title>${escapeHtml(title)} - DSH Hub</title>
  <style>${BASE_CSS}${CSS}</style>
</head>
<body>
  <a class="skip-link" href="#main">跳到主要内容</a>
  ${renderNav(user, csrf)}
  <main class="container" id="main">
    ${flashHtml(flash)}
    ${content}
  </main>
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
  <style>${BASE_CSS}${CSS}${AUTH_CSS}</style>
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
  background: var(--surface-canvas);
  min-height: 100vh;
  /* 移动端键盘弹起时 vh 不收缩，用 dvh 让容器跟随可视区 */
  min-height: 100dvh;
  display: flex;
  /* 顶部对齐 + 允许滚动：键盘弹起时聚焦输入框仍可滚入可视区（修复部分机型调不起输入法/被遮挡） */
  align-items: flex-start;
  justify-content: center;
  padding: 3rem 1rem;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.auth-page {
  width: 100%;
  max-width: 400px;
  /* 空间足够时视觉居中；内容溢出时 auto 归零 → 顶部对齐并可滚动 */
  margin: auto 0;
}
.auth-card {
  background: var(--surface-canvas);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-float);
  padding: 2.5rem 2rem;
}
.auth-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-title);
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
  color: var(--text-ui);
  margin-bottom: 0.5rem;
}
.auth-card .form-control {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--surface-card);
  border: none;
  /* 原为未定义的 --radius-pill（静默失效），改用标准圆角 */
  border-radius: var(--radius-md);
  /* 16px：iOS 聚焦时不自动放大页面 */
  font-size: 16px;
  color: var(--text-ui);
  box-sizing: border-box;
  /* 部分移动端内核默认禁止输入框选中文本，显式放开以保证可编辑 */
  -webkit-user-select: text;
  user-select: text;
  transition: background 0.2s, box-shadow 0.2s;
}
.auth-card .form-control:focus {
  outline: none;
  background: var(--surface-hover);
  box-shadow: var(--focus-ring);
}
.auth-card .form-control::placeholder {
  color: var(--text-tertiary);
}
.auth-card .btn-primary {
  margin-top: 0.5rem;
  /* 移动端触摸目标 ≥44px */
  min-height: 44px;
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
/* 小屏：收窄留白，避免键盘弹起后可用高度过小 */
@media (max-width: 480px) {
  .auth-body {
    padding: 1.5rem 1rem;
  }
  .auth-card {
    padding: 2rem 1.25rem;
  }
}
`;
