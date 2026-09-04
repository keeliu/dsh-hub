# Workspace 流程收尾实施清单

## Phase 1：支付返回页

- [ ] 1.1 `views/user.ts`：`renderPaymentReturnPage` 中「进入首页」按钮改为「进入工作区」，`href` 改为 `/workspace`

## Phase 2：首页重定向

- [ ] 2.1 `pages.ts`：`GET /` 路由中，有会员时改为 `redirect(res, '/workspace')`，移除实例列表页渲染

## Phase 3：登录后跳转

- [ ] 3.1 `pages.ts`：`POST /login` 成功回调中，有会员时跳转到 `/workspace` 而非 `/`

## Phase 4：验证

- [ ] 4.1 类型检查通过（`tsc -p . --noEmit`）
- [ ] 4.2 验证支付返回页按钮指向 `/workspace`
- [ ] 4.3 验证有会员用户访问 `/` 被重定向到 `/workspace`
- [ ] 4.4 验证无会员用户访问 `/` 被重定向到 `/membership`（不受影响）
- [ ] 4.5 验证有会员用户登录后跳转到 `/workspace`
- [ ] 4.6 验证管理员登录后仍进入 `/admin`（不受影响）
- [ ] 4.7 验证导航栏「实例管理」仍可访问 `/instances`
