# Proposal: 网关鉴权缺陷修复

## Why

M3 鉴权网关存在两个阻塞性 bug，导致网关路由在实际运行中不可用：

1. **Session cookie 名称不匹配**：`gateway.ts` 第 160 行硬编码 `'session_id'` 解析 cookie，但实际 session cookie 名是 `dshhub_sid`（`sessions.ts` 定义的 `SESSION_COOKIE` 常量）。结果是网关永远无法通过 session cookie 鉴权，只有 Bearer token 能走通。

2. **身份标识语义错位**：`subdomain.ts` 的 `verifyInstanceOwnership` 用 `user.dir_name` 与 URL 路径中的 `userSlug` 做等值比较，但 `dir_name` 是净化后的昵称（可含中文、`-2` 后缀），`userSlug` 是 ASCII slug。合法用户无法通过此校验访问自己的实例。

## What Changes

### 修复 1：Cookie 名称统一

| 文件 | 变更前 | 变更后 |
|---|---|---|
| `src/gateway.ts` | `parseCookie(cookie, 'session_id')` | `parseCookie(cookie, SESSION_COOKIE)` |

同时删除 `gateway.ts` 中自定义的 `parseCookie` 函数，改用 `http.ts` 的 `parseCookies`。

### 修复 2：身份标识校验链路

| 文件 | 变更前 | 变更后 |
|---|---|---|
| `src/subdomain.ts` | `user.dir_name !== info.userSlug` | 通过 `users.slug` 字段匹配，再用 `user.id` 校验 `instances.owner_id` |

### 修复 3：鉴权逻辑复用

`gateway.ts` 的 `authenticateRequest` 函数改为直接调用 `auth.ts` 的 `authenticate()`，消除第二套鉴权解析逻辑。

## Impact

- **破坏性**：无。这是 bug 修复，不改变任何公共 API 或 URL 格式。
- **影响范围**：`src/gateway.ts`、`src/subdomain.ts`
- **风险**：低。修改量小，逻辑收敛到已有正确实现。
