/**
 * DSH Hub · 基础层样式
 *
 * 职责：全站级别的可访问性基线与重置，必须**先于**组件样式注入。
 * 关键决策：
 *   - `:focus-visible` 在这里统一兜底：此前全仓库没有任何焦点样式，
 *     且 `.form-control:focus` 明确写了 `outline: none` 而无替代，键盘用户无法定位焦点
 *     （`design.md` §9 强制项）。
 *   - 提供 `.sr-only` / `.skip-link`：为后续补 `aria-*` 语义时提供必备工具类。
 * 文档：`design.md` §3.11（焦点环）、§9（可访问性）。
 */

export const BASE_STYLES = String.raw`
/* ---------- 全局焦点可见性 ---------- */
:focus-visible {
  outline: var(--focus-outline);
  outline-offset: var(--focus-offset);
}

/* 鼠标用户不显示焦点环，键盘用户必须有 */
:focus:not(:focus-visible) {
  outline: none;
}

/* ---------- 可访问性工具类 ---------- */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.skip-link {
  position: absolute;
  left: var(--space-4);
  top: calc(-1 * var(--space-8));
  z-index: var(--z-toast);
  padding: var(--space-2) var(--space-4);
  background: var(--brand-primary);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  text-decoration: none;
  transition: top var(--dur-fast) var(--ease);
}

.skip-link:focus {
  top: var(--space-4);
}

/* ---------- 全局基本重置 ---------- */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--text-body);
  background: var(--surface-sunken);
  -webkit-font-smoothing: antialiased;
}

/* 所有数字列默认等宽数字，避免表格跳动（design.md §3.5） */
.tabular,
.table td,
.table th {
  font-variant-numeric: var(--font-numeric);
}
`;
