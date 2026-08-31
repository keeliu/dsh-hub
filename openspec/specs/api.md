# API 路由总览规范

> 状态：已实现（M1 + M2 + M2.1）
> 模块：`src/api.ts`、`src/http.ts`
> 服务：零依赖 node:http 单进程，默认监听 127.0.0.1:3082

## Requirement: 路由框架

系统使用声明式路由，支持 auth 和 csrf 选项。

Scenario: 路由声明
- WHEN 定义路由
- THEN 支持 `{ auth: true }` 标记需要登录
- AND 支持 `{ csrf: true }` 标记需要 CSRF token
- AND auth 路由强制校验 status=active

Scenario: 路由匹配
- GIVEN 请求到达
- WHEN 匹配路由
- THEN 按 method + path segments 精确匹配
- AND 支持 `:param` 参数捕获
- AND 畸形百分号编码返回 400

Scenario: 错误处理
- WHEN handler 抛出 HttpError
- THEN 返回对应 status 和 `{ error: { code, message } }`
- WHEN handler 抛出未捕获异常
- THEN 返回 500 `{ error: { code: "internal", message: "internal error" } }`

## Requirement: 认证 API

| 方法 | 路径 | 功能 | 鉴权 | CSRF |
|---|---|---|---|---|
| POST | `/api/auth/setup` | 首启向导 | 无（无用户时） | 否 |
| POST | `/api/auth/register` | 注册 | 无 | 否 |
| POST | `/api/auth/login` | 登录 | 无 | 否 |
| POST | `/api/auth/logout` | 登出 | 无 | 是 |

Scenario: setup 响应
- GIVEN 无用户时 setup 成功
- THEN 返回 `{ user: {...} }`
- AND 设置 session cookie + CSRF cookie

Scenario: register 响应
- GIVEN 注册成功
- THEN 返回 `{ user: {...} }`
- AND 设置 session cookie + CSRF cookie

Scenario: login 响应
- GIVEN 登录成功
- THEN 返回 `{ user: {...} }`
- AND 设置 session cookie + CSRF cookie

## Requirement: 用户自身 API

| 方法 | 路径 | 功能 | 鉴权 | CSRF |
|---|---|---|---|---|
| GET | `/api/me` | 自己的信息 | 是 | 否 |
| POST | `/api/me/tokens` | 签发 API token | 是 | 是 |
| GET | `/api/me/tokens` | 列出 token | 是 | 否 |
| POST | `/api/me/tokens/:id/revoke` | 吊销 token | 是 | 是 |

Scenario: /api/me 响应
- THEN 返回 `{ user: publicUser }`（不含 password_hash）

Scenario: 签发 token 响应
- THEN 返回 `{ id, token }`（token 仅此一次明文返回）

Scenario: 列出 token 响应
- THEN 返回 `{ tokens: [...] }`（不含 token_hash）

## Requirement: 实例 API

| 方法 | 路径 | 功能 | 鉴权 | CSRF |
|---|---|---|---|---|
| GET | `/api/instances` | 列出自己的实例 | 是 | 否 |
| POST | `/api/instances` | 创建实例 | 是 | 是 |
| GET | `/api/instances/:id` | 实例详情 | 是 | 否 |
| GET | `/api/instances/:id/logs` | 查看日志 | 是 | 否 |
| POST | `/api/instances/:id/start` | 启动 | 是 | 是 |
| POST | `/api/instances/:id/stop` | 停止 | 是 | 是 |
| POST | `/api/instances/:id/restart` | 重启 | 是 | 是 |
| DELETE | `/api/instances/:id` | 删除 | 是 | 是 |

Scenario: 列出实例响应
- THEN 返回 `{ instances: [...] }`（仅自己的）

Scenario: 创建实例请求体
- THEN 接受 `{ name?: string, harness_version?: string }`

Scenario: 创建实例响应
- THEN 返回 `{ instance: publicInstance }`

Scenario: 实例详情响应
- THEN 返回 `{ instance: publicInstance }`
- AND 非属主非管理员返回 404

Scenario: 日志请求
- THEN 接受 `?tail=N`（默认 200，最大 2000）
- AND 返回 `{ id, log }`

Scenario: 启动/停止/重启响应
- THEN 返回 `{ instance: publicInstance }`（最新状态）

Scenario: 启动失败
- THEN 返回 502 `start_failed`

## Requirement: 管理 API

| 方法 | 路径 | 功能 | 权限 | CSRF |
|---|---|---|---|---|
| GET | `/admin/api/users` | 用户列表 | admin/root | 否 |
| POST | `/admin/api/users` | 创建用户 | admin/root | 是 |
| GET | `/admin/api/users/:id` | 用户详情 | admin/root | 否 |
| PATCH | `/admin/api/users/:id` | 修改用户 | admin/root | 是 |
| GET | `/admin/api/instances` | 跨用户实例 | admin/root | 否 |
| GET | `/admin/api/audit` | 审计日志 | admin/root | 否 |
| GET | `/admin/api/settings` | 获取设置 | admin/root | 否 |
| PUT | `/admin/api/settings` | 更新设置 | admin/root | 是 |

Scenario: 创建用户请求体
- THEN 接受 `{ nickname, password, role?, email?, max_instances?, max_running? }`

Scenario: 修改用户请求体
- THEN 接受 `{ status?, role?, password?, max_instances?, max_running? }`

Scenario: 审计日志请求
- THEN 接受 `?limit=N`（默认 200，最大 1000）
- AND 返回 `{ audit: [...] }`（按 id 降序）

Scenario: 获取设置响应
- THEN 返回 `{ settings: { key: value, ... } }`

Scenario: 更新设置请求体
- THEN 接受已知设置键的键值对
- AND 未知键返回 400 `invalid_key`
- AND registration_open 只接受 "open" | "closed"
- AND default_harness_version 必须是合法 semver 或空
- AND allowed_harness_versions 必须是逗号分隔 semver 或空

## Requirement: 健康检查

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| GET | `/healthz` | 健康检查 | 无 |

Scenario: 健康检查响应
- THEN 返回 `{ ok: true }`

## Requirement: 响应格式

Scenario: 成功响应
- THEN Content-Type: application/json; charset=utf-8
- AND Cache-Control: no-store

Scenario: 错误响应
- THEN 格式为 `{ error: { code: string, message: string } }`

Scenario: 用户信息脱敏
- WHEN 返回用户信息
- THEN 不包含 password_hash

## Requirement: 请求解析

Scenario: JSON body 读取
- GIVEN Content-Type 非 JSON
- WHEN body 可解析为 JSON
- THEN 宽松处理（仍解析）

Scenario: body 大小限制
- GIVEN body 超过 1MiB
- WHEN 读取
- THEN 返回 413 `payload_too_large`

Scenario: Cookie 解析
- GIVEN cookie 值含畸形百分号编码
- WHEN 解析
- THEN 跳过该 cookie（不报错）

## Requirement: 公共实例信息格式

Scenario: publicInstance 字段
- THEN 包含：id, name, port, harness_version, trusted_host, status, pid, auto_restart, created_at, last_started_at, owner_id
- AND 管理员查看时额外包含 owner_nickname
