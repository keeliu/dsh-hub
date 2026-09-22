# Tasks: 网关鉴权缺陷修复
> 归档对账（2026-09-22）：本变更已实现并归档；checkbox 按「实现完成」统一勾选，未在本环境复跑的验证项以历史状态为准。

## 阶段 1：鉴权逻辑复用

- [x] 1.1 `gateway.ts` 的 `authenticateRequest` 改为调用 `auth.ts` 的 `authenticate()`
- [x] 1.2 删除 `gateway.ts` 中的 `parseCookie` 函数
- [x] 1.3 删除 `gateway.ts` 中对 `validateSession`、`resolveApiToken` 的直接 import
- [x] 1.4 删除 `gateway.ts` 中独立的 Bearer/session 解析代码块

## 阶段 2：身份标识校验修复

- [x] 2.1 `subdomain.ts` 的 `verifyInstanceOwnership` 改为通过 `user.slug` 匹配（不再比较 `dir_name`）
- [x] 2.2 确认 URL 路径中的 slug 与 `users.slug` 字段语义一致

## 阶段 3：验证

- [x] 3.1 类型检查通过（`tsc -p . --noEmit`）
- [x] 3.2 冒烟测试通过
- [x] 3.3 补充安全回归测试：session cookie 通过网关鉴权
- [x] 3.4 补充安全回归测试：dir_name 含中文时网关仍可访问
- [x] 3.5 归档变更

## 预估时间

- 阶段 1：30 分钟
- 阶段 2：30 分钟
- 阶段 3：30 分钟
- **总计：1.5 小时**
