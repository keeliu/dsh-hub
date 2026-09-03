# Workspace 直接嵌入 DSH 实例

## Why

当前用户访问 DSH 实例需要通过 `/i/<slug>-<id>` 路径，DSH 实例是独立的全屏页面，与 DSH Hub 的导航栏、品牌标识完全割裂。

用户希望付费后直接进入一个统一的工作区页面：顶部是 DSH Hub 的导航栏（logo、智能体、系统管理、用户下拉），下方直接渲染 DSH 实例的完整功能（聊天、插件、设置等），形成一个统一的产品体验。

不使用 iframe 的原因：iframe 有样式割裂感、双重滚动条、通信受限、移动端体验差等问题。直接嵌入（同 DOM）能实现真正的视觉统一和无缝交互。

## What Changes

1. **新增 `/workspace` 入口路由**：认证检查 → 查找用户 running 实例 → 获取实例 index.html → 重写资源路径 → 注入 apiBase 配置 → 返回
2. **新增 `/workspace/*` 通配代理路由**：去掉 `/workspace` 前缀 → 代理到实例 → 重写响应体中的绝对路径
3. **HTML/CSS 响应体重写**：将实例返回的绝对路径（`/assets/`、`/plugins/` 等）重写为 `/workspace/assets/`、`/workspace/plugins/`
4. **注入 `__DSH_DEPLOYMENT__` 配置**：设置 `apiBase: '/workspace'`、`wsBase: '/workspace'`，使 DSH 前端的 API/WS 请求自动带前缀
5. **SPA fallback**：`/workspace/chat`、`/workspace/settings` 等 SPA 路由返回重写后的 index.html
6. **WebSocket 代理支持 `/workspace` 前缀**：WS 连接 `/workspace/ws` 代理到实例 `/ws`
7. **新增 `views/workspace.ts`**：Workspace 页面渲染（含 DSH Hub 顶栏 + 自动启动逻辑）

## Impact

- **新增文件**：`src/views/workspace.ts`
- **修改文件**：`src/gateway.ts`（新增 workspace 代理 + 响应体重写）、`src/pages.ts`（新增 `/workspace` 路由）、`src/api.ts`（扩展 fallback 支持 `/workspace/api/*`）
- **不影响**：现有 `/i/<slug>-<id>` 网关代理、实例管理 API、会员系统
- **风险**：HTML/CSS 重写规则可能因 DSH 版本升级而失效，需要维护
