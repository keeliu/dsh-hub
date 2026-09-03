# Workspace 直接嵌入实施清单

## Phase 1：基础代理

- [ ] 1.1 `gateway.ts` 新增 `rewriteHtmlPaths(html, prefix)` 函数
  - 重写 `<script src>`、`<link href>`、`<img src>` 等标签属性中的绝对路径
  - 不重写外部 URL、相对路径、data URI
- [ ] 1.2 `gateway.ts` 新增 `injectDeploymentConfig(html, prefix)` 函数
  - 在 `<head>` 中注入 `<script>window.__DSH_DEPLOYMENT__ = { apiBase, wsBase }</script>`
- [ ] 1.3 `gateway.ts` 新增 `handleWorkspaceEntry(db, req, res)` 函数
  - 认证检查 → 查找 running 实例 → 获取 index.html → 重写 + 注入 → 返回
- [ ] 1.4 `pages.ts` 新增 `GET /workspace` 路由 → 调用 `handleWorkspaceEntry`

## Phase 2：通配代理 + API

- [ ] 2.1 `gateway.ts` 新增 `handleWorkspaceProxy(db, req, res, pathname)` 函数
  - 去掉 `/workspace` 前缀 → 代理到实例 → 根据 Content-Type 重写响应体
- [ ] 2.2 `pages.ts` 新增 `GET /workspace/*` 通配路由 → 调用 `handleWorkspaceProxy`
  - SPA fallback：路径不是真实文件时返回重写后的 index.html
- [ ] 2.3 `api.ts` 扩展 DSH API fallback：支持 `/workspace/api/*` 路径
  - 去掉 `/workspace` 前缀后走现有代理逻辑

## Phase 3：WebSocket + CSS + 自动启动

- [ ] 3.1 `gateway.ts` 扩展 WebSocket 升级处理：支持 `/workspace/ws` 路径
  - 去掉 `/workspace` 前缀 → 复用现有 WS 代理逻辑
- [ ] 3.2 `gateway.ts` 新增 `rewriteCssPaths(css, prefix)` 函数
  - 重写 CSS 中 `url(/...)` 为 `url(/workspace/...)`
  - 在 `handleWorkspaceProxy` 中对 CSS 响应体调用此函数
- [ ] 3.3 `views/workspace.ts` 新增 Workspace 页面渲染
  - 无 running 实例时显示 loading + 自动调用 start + 轮询状态
  - 有 running 实例时由 `handleWorkspaceEntry` 处理（不需要单独页面）

## Phase 4：付费后自动进入 Workspace

- [ ] 4.1 `membership.ts` 改造 `handlePaymentCallback`：支付成功后调用 `ensureInstanceForUser` + `startInstance`
- [ ] 4.2 `pages.ts` 改造 `GET /` 路由：按会员状态重定向（有会员 → `/workspace`，无会员 → `/membership`）
- [ ] 4.3 `pages.ts` 改造 `GET /workspace` 路由：无会员时重定向到 `/membership`
- [ ] 4.4 `views/user.ts` 改造支付成功返回页：跳转到 `/workspace` 而非 `/membership`

## Phase 5：导航栏增强

- [ ] 5.1 `views/layout.ts` 用户下拉菜单增加「个人中心」→ `/profile`
- [ ] 5.2 `views/layout.ts` 用户下拉菜单增加「实例管理」→ `/instances`
- [ ] 5.3 确认「退出系统」保留在最下方，红色文字

## Phase 6：测试验证

- [ ] 6.1 类型检查通过（`tsc --noEmit`）
- [ ] 6.2 手动验证：访问 `/workspace` 能看到 DSH 实例正常渲染
- [ ] 6.3 手动验证：DSH 实例内的 API 请求（聊天、插件）正常工作
- [ ] 6.4 手动验证：DSH 实例内的 WebSocket 连接（实时消息）正常工作
- [ ] 6.5 手动验证：刷新页面（SPA 路由）不出现 404
- [ ] 6.6 手动验证：CSS 样式正常加载（字体、图标等）
- [ ] 6.7 手动验证：付费后自动跳转到 `/workspace` 且实例已启动
- [ ] 6.8 手动验证：会员过期后访问 `/workspace` 重定向到 `/membership`
- [ ] 6.9 手动验证：导航栏下拉菜单中「个人中心」「实例管理」跳转正确
- [ ] 6.10 冒烟测试：现有 `/i/<slug>-<id>` 网关代理不受影响
