# Workspace 流程收尾

## Why

Workspace 页面（`/workspace`）的核心功能已实现：路由注册、代理逻辑、响应体重写、会员校验均已到位。但用户从「付费」到「进入 Workspace 开始使用」的完整流程中，有 3 处跳转逻辑仍指向旧页面（`/` 实例列表页），导致付费用户无法自动进入 Workspace。

当前流程断点：
1. 支付成功返回页 → 按钮指向 `/`（实例列表），用户需手动找 Workspace 入口
2. 首页 `/` → 渲染实例列表页，而非直接进入 Workspace
3. 登录成功 → 跳转到 `/`（实例列表），而非 Workspace

这 3 处断点让「付费后自动进入 Workspace」的体验不完整。

## What Changes

1. **支付返回页按钮**：`views/user.ts` 中「进入首页」按钮改为「进入工作区」，指向 `/workspace`
2. **首页重定向**：`pages.ts` 中 `GET /` 逻辑，有会员时直接 `redirect` 到 `/workspace`，不再渲染实例列表页
3. **登录后跳转**：`pages.ts` 中登录成功回调，有会员时跳转到 `/workspace` 而非 `/`

## Impact

- **修改文件**：`src/views/user.ts`（1 行）、`src/pages.ts`（2 处）
- **不影响**：`/instances` 页面仍可通过导航栏「实例管理」访问
- **不影响**：管理员（admin/root）登录后仍进入管理后台
