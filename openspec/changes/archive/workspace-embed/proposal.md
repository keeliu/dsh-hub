# Workspace 直接嵌入 DSH 实例

## Why

当前用户访问 DSH 实例需要通过 `/i/<slug>-<id>` 路径，DSH 实例是独立的全屏页面，与 DSH Hub 的导航栏、品牌标识完全割裂。

用户希望付费后直接进入一个统一的工作区页面：顶部是 DSH Hub 的导航栏（logo、智能体、系统管理、用户下拉），下方直接渲染 DSH 实例的完整功能（聊天、插件、设置等），形成一个统一的产品体验。

不使用 iframe 的原因：iframe 有样式割裂感、双重滚动条、通信受限、移动端体验差等问题。直接嵌入（同 DOM）能实现真正的视觉统一和无缝交互。

## What Changes

### 一、Workspace 直接嵌入

1. **新增 `/workspace` 入口路由**：认证检查 → 查找用户 running 实例 → 获取实例 index.html → 重写资源路径 → 注入 apiBase 配置 → 返回
2. **新增 `/workspace/*` 通配代理路由**：去掉 `/workspace` 前缀 → 代理到实例 → 重写响应体中的绝对路径
3. **HTML/CSS 响应体重写**：将实例返回的绝对路径（`/assets/`、`/plugins/` 等）重写为 `/workspace/assets/`、`/workspace/plugins/`
4. **注入 `__DSH_DEPLOYMENT__` 配置**：设置 `apiBase: '/workspace'`、`wsBase: '/workspace'`，使 DSH 前端的 API/WS 请求自动带前缀
5. **SPA fallback**：`/workspace/chat`、`/workspace/settings` 等 SPA 路由返回重写后的 index.html
6. **WebSocket 代理支持 `/workspace` 前缀**：WS 连接 `/workspace/ws` 代理到实例 `/ws`

### 二、付费后自动进入 Workspace

7. **付费成功自动创建 + 启动实例**：支付回调成功后，自动调用 `ensureInstanceForUser` 创建实例并启动，然后重定向到 `/workspace`
8. **首页重定向逻辑调整**：
   - 已登录 + 有有效会员 → 重定向到 `/workspace`
   - 已登录 + 无会员/会员过期 → 重定向到 `/membership`
   - 未登录 → 重定向到 `/login`

### 三、导航栏增强

9. **用户下拉菜单增加入口**：在顶栏用户头像/昵称下拉菜单中增加「个人中心」和「实例管理」选项
10. **`/workspace` 页面顶栏**：复用现有 DSH Hub 导航栏，用户下拉菜单包含「个人中心」「实例管理」「退出系统」

## Impact

- **新增文件**：`src/views/workspace.ts`
- **修改文件**：`src/gateway.ts`（新增 workspace 代理 + 响应体重写）、`src/pages.ts`（新增 `/workspace` 路由 + 首页重定向逻辑）、`src/api.ts`（扩展 fallback 支持 `/workspace/api/*`）、`src/views/layout.ts`（用户下拉菜单增加入口）、`src/membership.ts`（支付回调后自动启动实例）
- **不影响**：现有 `/i/<slug>-<id>` 网关代理、实例管理 API
- **风险**：HTML/CSS 重写规则可能因 DSH 版本升级而失效，需要维护
