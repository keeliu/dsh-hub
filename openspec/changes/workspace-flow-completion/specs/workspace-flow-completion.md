# Workspace 流程收尾规范

## 术语

- **Workspace**：`/workspace` 页面，DSH Hub 顶栏下方直接嵌入 DSH 实例的工作区页面
- **实例列表页**：原首页 `/` 渲染的实例管理列表页面

## 支付返回页跳转

Given 用户完成支付，会员已激活，实例已自动创建并启动

When 用户看到支付成功返回页（`/payment/return`）

Then 页面中的主操作按钮显示为「进入工作区」，点击后跳转到 `/workspace`

## 首页重定向

Given 已登录用户访问首页 `GET /`

When 用户有有效会员（`hasActiveMembership` 返回 true）

Then 服务器返回 302 重定向到 `/workspace`，不渲染实例列表页

When 用户无有效会员

Then 服务器返回 302 重定向到 `/membership`（现有逻辑不变）

## 登录后跳转

Given 用户登录成功（`POST /login` 验证通过）

When 用户有有效会员

Then 登录成功后跳转到 `/workspace`

When 用户无有效会员

Then 登录成功后跳转到 `/membership`（现有逻辑不变）

## 导航栏入口

Given 用户在任何页面

When 用户点击导航栏的用户头像/昵称下拉菜单

Then 下拉菜单中包含「个人中心」（`/profile`）和「实例管理」（`/instances`）选项

注：此功能已在 `views/layout.ts` 中实现，本次无需改动，仅作为验收条件列出。

## 安全约束

- 首页重定向和登录后跳转的会员检查逻辑与现有 `handleWorkspaceEntry` 中的会员检查一致
- 管理员（admin/root）登录后不受会员检查限制，仍进入管理后台
