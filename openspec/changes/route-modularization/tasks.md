# Tasks: 路由层模块化拆分

## 前置条件

- [x] `logic-dedup` 已完成（pages.ts 已瘦身）

## 阶段 1：提取辅助函数

- [ ] 1.1 `publicUser()` 移至 `users.ts`
- [ ] 1.2 `publicInstance()` 移至 `instances.ts`
- [ ] 1.3 `sessionCookiePairs()` / `clearSessionCookies()` 移至 `sessions.ts`
- [ ] 1.4 `validQuota()` / `clampInt()` / `requireInstance()` / `withInstanceOp()` 移至 `routes/helpers.ts`

## 阶段 2：拆分 API 路由

- [ ] 2.1 创建 `routes/api-auth.ts`，迁移认证相关路由
- [ ] 2.2 创建 `routes/api-me.ts`，迁移用户信息/token 路由
- [ ] 2.3 创建 `routes/api-instances.ts`，迁移实例路由
- [ ] 2.4 创建 `routes/api-admin.ts`，迁移管理路由
- [ ] 2.5 创建 `routes/index.ts`，聚合 API 路由注册

## 阶段 3：拆分页面路由

- [ ] 3.1 创建 `routes/page-auth.ts`，迁移认证页面路由
- [ ] 3.2 创建 `routes/page-instances.ts`，迁移用户实例页面路由
- [ ] 3.3 创建 `routes/page-admin.ts`，迁移管理后台页面路由
- [ ] 3.4 在 `routes/index.ts` 中聚合页面路由注册

## 阶段 4：精简主文件

- [ ] 4.1 `api.ts` 删除已迁移的路由，保留路由框架 + `startServer`
- [ ] 4.2 `pages.ts` 删除已迁移的路由，保留 `handlePageRequest`
- [ ] 4.3 确认 `api.ts` ≤ 300 行、`pages.ts` ≤ 300 行

## 阶段 5：验证

- [ ] 5.1 类型检查通过
- [ ] 5.2 冒烟测试通过
- [ ] 5.3 确认所有 API 端点行为不变
- [ ] 5.4 确认所有页面路由行为不变
- [ ] 5.5 归档变更

## 预估时间

- 阶段 1：1 小时
- 阶段 2：2 小时
- 阶段 3：2 小时
- 阶段 4：1 小时
- 阶段 5：1 小时
- **总计：7 小时**
