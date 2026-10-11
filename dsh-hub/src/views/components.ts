/**
 * DSH Hub · 通用 HTML 片段组件
 *
 * 职责：把散落在各视图里的重复片段收敛为**单点实现**，避免同一语义出现两套写法
 * （`design.md` §10.3 命名与内联样式、§10.4 插值与 HTML 安全）。
 * 关键决策：
 *   - `csrfField()` 是唯一的 CSRF 隐藏字段渲染器：字段名固定 `_csrf`，
 *     与服务端 `assertPageCsrf` / `assertCsrf` 的读取键一致。
 *     历史上 `layout.ts` 的退出登录表单写成了 `name="csrf" value=""`（死字段），
 *     归零到这里以后不会再出现第二种拼法。
 *   - 所有插值一律走 `escapeHtml`。
 * 文档：`design.md` §5（组件规范）。
 */

import { escapeHtml } from '../http.ts';

/** CSRF 隐藏字段（字段名 `_csrf`，服务端唯一读取键） */
export function csrfField(csrf: string): string {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">`;
}

/** 闪回提示条；无内容时返回空串（调用方因此只需插值一次） */
export function flashHtml(flash?: { type: string; message: string } | null): string {
  if (!flash) return '';
  return `<div class="alert alert-${escapeHtml(flash.type)}" role="status">${escapeHtml(flash.message)}</div>`;
}
