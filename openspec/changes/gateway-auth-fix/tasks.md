# Tasks: 网关鉴权缺陷修复

## 阶段 1：鉴权逻辑复用

- [ ] 1.1 `gateway.ts` 的 `authenticateRequest` 改为调用 `auth.ts` 的 `authenticate()`
- [ ] 1.2 删除 `gateway.ts` 中的 `parseCookie` 函数
- [ ] 1.3 删除 `gateway.ts` 中对 `validateSession`、`resolveApiToken` 的直接 import
- [ ] 1.4 删除 `gateway.ts` 中独立的 Bearer/session 解析代码块

## 阶段 2：身份标识校验修复

- [ ] 2.1 `subdomain.ts` 的 `verifyInstanceOwnership` 改为通过 `user.slug` 匹配（不再比较 `dir_name`）
- [ ] 2.2 确认 URL 路径中的 slug 与 `users.slug` 字段语义一致

## 阶段 3：验证

- [ ] 3.1 类型检查通过（`tsc -p . --noEmit`）
- [ ] 3.2 冒烟测试通过
- [ ] 3.3 补充安全回归测试：session cookie 通过网关鉴权
- [ ] 3.4 补充安全回归测试：dir_name 含中文时网关仍可访问
- [ ] 3.5 归档变更

## 预估时间

- 阶段 1：30 分钟
- 阶段 2：30 分钟
- 阶段 3：30 分钟
- **总计：1.5 小时**
