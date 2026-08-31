# Tasks: 页面与 API 重复逻辑统一

## 阶段 1：提取业务层函数

- [ ] 1.1 `auth.ts` 新增 `attemptLogin()` 函数
- [ ] 1.2 `users.ts` 新增 `disableUser()` 函数
- [ ] 1.3 确认 `createUserRow()` 已覆盖所有用户创建场景

## 阶段 2：改造 pages.ts

- [ ] 2.1 POST /setup 改用 `createUserRow()`
- [ ] 2.2 POST /register 改用 `createUserRow()`
- [ ] 2.3 POST /login 改用 `attemptLogin()`
- [ ] 2.4 POST /admin/users 改用 `createUserRow()`
- [ ] 2.5 POST /admin/users/:id/disable 改用 `disableUser()`
- [ ] 2.6 `process.env.DSH_HUB_COOKIE_SECURE` 替换为 `config.cookieSecure`
- [ ] 2.7 注册后自动建实例逻辑提取为 `postRegisterActions()`

## 阶段 3：清理

- [ ] 3.1 删除 pages.ts 中不再使用的内联 SQL
- [ ] 3.2 删除 pages.ts 中不再使用的 import
- [ ] 3.3 确认 pages.ts 中无直接 `process.env` 访问

## 阶段 4：验证

- [ ] 4.1 类型检查通过
- [ ] 4.2 冒烟测试通过
- [ ] 4.3 逐一验证每个 POST handler 行为不变（setup/register/login/admin create/disable）
- [ ] 4.4 归档变更

## 预估时间

- 阶段 1：1 小时
- 阶段 2：2 小时
- 阶段 3：30 分钟
- 阶段 4：1 小时
- **总计：4.5 小时**
