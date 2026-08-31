# Spec: 网关鉴权缺陷修复

## Feature: Session Cookie 鉴权

### Scenario: 网关通过 session cookie 鉴权
- GIVEN 用户已登录，浏览器持有 `dshhub_sid` cookie
- WHEN 用户访问 `/i/<slug>-<id>/...`
- THEN 网关识别 session cookie 并成功鉴权
- AND 请求被代理到对应实例

### Scenario: 网关通过 Bearer token 鉴权
- GIVEN 请求携带 `Authorization: Bearer dsh_xxx`
- WHEN 用户访问 `/i/<slug>-<id>/...`
- THEN 网关识别 Bearer token 并成功鉴权

### Scenario: 未鉴权请求重定向
- GIVEN 请求无有效 cookie 且无 Bearer token
- WHEN 用户访问 `/i/<slug>-<id>/...`
- AND 请求 Accept 包含 text/html
- THEN 返回 302 重定向到 `/login?redirect=...`

### Scenario: 禁用账号不可通过网关
- GIVEN 用户 status=disabled
- WHEN 使用其 session cookie 或 Bearer token 访问网关
- THEN 鉴权失败，视为未鉴权

## Feature: 实例所有权校验

### Scenario: 通过 slug 匹配用户
- GIVEN URL 路径为 `/i/john-i-abc12345/...`
- WHEN 校验实例所有权
- THEN 通过 `users.slug = 'john'` 查找用户
- AND 通过 `user.id` 校验 `instances.owner_id`
- AND 不依赖 `dir_name` 做路径匹配

### Scenario: slug 与实例不匹配
- GIVEN 用户 slug 为 `john`
- WHEN 访问 `/i/jane-i-xyz98765/...`（他人实例）
- AND 用户角色为 user（非 admin/root）
- THEN 返回 404

### Scenario: 管理员可访问他人实例
- GIVEN 用户角色为 admin 或 root
- WHEN 访问 `/i/<any-slug>-<id>/...`
- THEN 所有权校验通过
