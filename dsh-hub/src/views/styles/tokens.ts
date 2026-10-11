/**
 * DSH Hub · 设计令牌（唯一颜色 / 尺寸来源）
 *
 * 职责：把 `design.md` §3 的 Design Tokens 落成 `:root` 声明，供全站样式引用。
 * 关键决策：
 *   - 本文件是**全仓库唯一允许出现颜色字面量**的地方（`scripts/ui-audit.mjs` 规则①）。
 *   - 旧变量名（`--primary` / `--bg-page` / `--radius-full` 等）以**过渡别名**形式
 *     保留一轮，值指向新令牌：这样一次替换即可全站生效，逐页改完后再删别名。
 *   - 用 `String.raw` 书写，避免 CSS 中的反斜杠（如字体名）被模板串转义。
 * 文档：`design.md` §3（令牌）、§11.3（迁移映射）、`openspec/changes/ui-design-system/`
 *
 * 迁移映射（旧 → 新）：
 *   --primary            → --brand-accent（强调蓝，原为 #0066cc）
 *   --primary-hover      → --brand-accent-strong
 *   --bg-body/--bg-page  → --surface-canvas / --surface-sunken
 *   --bg-input           → --surface-card
 *   --bg-sidebar         → --surface-sunken
 *   --bg-navbar          → --brand-primary（深色导航已废弃，见 design.md §11.1）
 *   --text-primary       → --text-title
 *   --text-secondary     → --text-secondary（保留）
 *   --text-placeholder   → --text-tertiary
 *   --text-white         → --text-inverse
 *   --success/--danger/--warning/--info → --state-success/--state-danger/--state-warning/--state-info（值压深）
 *   --border             → --border-strong
 *   --shadow-card        → --shadow-none（卡片改为浅灰底、无阴影）
 *   --shadow-elevated    → --shadow-float
 *   --radius-sm          → --radius-xs（4px）
 *   --radius-md          → --radius-md（8px，保留）
 *   --radius-lg          → --radius-lg（12px，保留）
 *   --radius-full        → --radius-pill（真胶囊 999px）
 *   --font-family        → --font-sans
 *   --font-size-base/sm/lg/xl/xxl → --fs-body/--fs-sm/--fs-section/--fs-metric/--fs-page-title
 */

export const TOKENS_CSS = String.raw`
:root {
  /* ---------- 3.1 画布与表面 ---------- */
  --surface-canvas: #ffffff;
  --surface-sunken: #f9fafb;
  --surface-card: #f5f6f7;
  --surface-hover: #f0f1f3;
  --surface-active: #ebeef2;
  --surface-raised: #ffffff;
  /** 中性按钮 / 输入框的悬浮填充（比卡片再深一档） */
  --surface-ui-hover: #ebebeb;

  /* ---------- 3.2 描边 ---------- */
  --border-hairline: #f0f1f3;
  --border-divider: #e5e5e5;
  --border-strong: #e5e7eb;

  /* ---------- 3.3 文字 ---------- */
  --text-title: #0f1115;
  --text-body: #1f2937;
  --text-secondary: #6b7280;
  --text-tertiary: #9ca3af;
  --text-inverse: #ffffff;
  /** 表单控件内的输入文字（比正文更深，用于输入框自身） */
  --text-ui: #333333;

  /* ---------- 深色代码区（日志查看器） ---------- */
  --code-bg: #1f2937;
  --code-fg: #e9ecef;

  /* ---------- 供 rgba() 合成使用的分量 ---------- */
  --brand-primary-rgb: 15, 17, 21;
  --brand-accent-rgb: 59, 130, 246;
  --scrim: rgba(0, 0, 0, 0.5);

  /* ---------- 3.4 品牌与状态 ---------- */
  --brand-primary: #0f1115;
  --brand-primary-hover: #2a2c30;
  --brand-accent: #3b82f6;
  --brand-accent-strong: #3c65df;
  --brand-accent-soft: #e4edfd;
  --brand-cta: #3964fe;
  --state-success: #16a34a;
  --state-success-hover: #15803d;
  --state-warning: #d97706;
  --state-danger: #dc2626;
  --state-danger-hover-bg: #fff1f0;
  --state-info: #2563eb;

  /* 徽章（浅底 / 深字，对比度均 ≥4.5:1） */
  --badge-success-bg: #dcfce7;
  --badge-success-fg: #15803d;
  --badge-warning-bg: #fef3c7;
  --badge-warning-fg: #b45309;
  --badge-danger-bg: #fee2e2;
  --badge-danger-fg: #b91c1c;
  --badge-info-bg: #dbeafe;
  --badge-info-fg: #1d4ed8;
  --badge-neutral-bg: var(--surface-hover);
  --badge-neutral-fg: var(--text-secondary);

  /* ---------- 3.5 字体 ---------- */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'SF Mono', Monaco, 'Cascadia Code', Menlo, Consolas, monospace;
  --font-numeric: tabular-nums;

  /* ---------- 3.6 字号 ---------- */
  --fs-page-title: 24px;
  --lh-page-title: 1.35;
  --fw-page-title: 600;
  --fs-section: 18px;
  --lh-section: 1.4;
  --fw-section: 600;
  --fs-metric-lg: 32px;
  --lh-metric-lg: 1.15;
  --fw-metric: 600;
  --fs-metric: 24px;
  --lh-metric: 1.2;
  --fs-body: 14px;
  --lh-body: 1.6;
  --fs-sm: 13px;
  --lh-sm: 1.5;
  --fs-caption: 12px;
  --lh-caption: 1.5;

  /* ---------- 3.7 间距（4px 网格，仅这 8 档） ---------- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;

  /* ---------- 3.8 圆角 ---------- */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 999px;

  /* ---------- 3.9 阴影 ---------- */
  --shadow-none: none;
  --shadow-hover: 0 1px 2px rgba(16, 24, 40, 0.06);
  --shadow-float: 0 4px 12px rgba(16, 24, 40, 0.08);
  --shadow-modal: 0 16px 48px rgba(16, 24, 40, 0.16);
  --overlay-scrim: rgba(16, 24, 40, 0.45);

  /* ---------- 3.10 动效 ---------- */
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 320ms;

  /* ---------- 3.11 焦点 ---------- */
  --focus-ring: 0 0 0 3px rgba(59, 130, 246, 0.28);
  --focus-outline: 2px solid var(--brand-accent);
  --focus-offset: 2px;

  /* ---------- 3.12 布局与层级 ---------- */
  --layout-sidebar-width: 240px;
  --layout-content-max: 1470px;
  --layout-topbar-height: 56px;
  --layout-header-gap: var(--space-6);
  --z-base: 0;
  --z-sticky: 10;
  --z-dropdown: 100;
  --z-drawer: 200;
  --z-modal: 300;
  --z-toast: 400;

  /* ========== 过渡别名（旧变量名 → 新令牌） ==========
   * 保留一轮，供尚未迁移的页面继续工作；P3 收口后统一删除。
   */
  --primary: var(--brand-accent);
  --primary-hover: var(--brand-accent-strong);
  --bg-body: var(--surface-canvas);
  --bg-input: var(--surface-card);
  --bg-sidebar: var(--surface-sunken);
  --bg-navbar: var(--brand-primary);
  --bg-page: var(--surface-sunken);
  --text-primary: var(--text-title);
  --text-placeholder: var(--text-tertiary);
  --text-white: var(--text-inverse);
  --success: var(--state-success);
  --danger: var(--state-danger);
  --warning: var(--state-warning);
  --info: var(--state-info);
  --border: var(--border-strong);
  --shadow-card: var(--shadow-none);
  --shadow-elevated: var(--shadow-float);
  --radius-full: var(--radius-pill);
  --font-family: var(--font-sans);
  --font-size-sm: var(--fs-caption);
  --font-size-base: var(--fs-body);
  --font-size-lg: 16px;
  --font-size-xl: var(--fs-section);
  --font-size-xxl: var(--fs-page-title);
  --font-size-2xl: 28px;
  --gray-600: var(--text-secondary);
  --text-muted: var(--text-tertiary);
  --color-text-tertiary: var(--text-tertiary);
  --color-primary: var(--brand-accent);
  --color-error: var(--state-danger);
}
`;

/** 降低动效偏好下的统一降级：所有过渡与动画不得对外可见地运行。 */
export const REDUCED_MOTION_CSS = String.raw`
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`;
