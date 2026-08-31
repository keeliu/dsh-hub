# Design: 路由层模块化拆分

## 路由注册机制

当前路由注册使用模块级 `routes` 数组和 `route()` 函数。拆分后需要支持外部注册。

### 方案：注册函数模式

每个路由文件导出 `register` 函数，接收路由注册回调：

```typescript
// routes/api-auth.ts
import type { Method, RouteOpts, Handler } from '../api.ts';

export function register(
  route: (method: Method, pattern: string, opts: RouteOpts, handler: Handler) => void
): void {
  route('POST', '/api/auth/setup', {}, async ({ db, req, res }) => { ... });
  route('POST', '/api/auth/login', {}, async ({ db, req, res }) => { ... });
  // ...
}
```

```typescript
// routes/index.ts
import * as apiAuth from './api-auth.ts';
import * as apiMe from './api-me.ts';
// ...

export function registerApiRoutes(route: RouteRegistrar): void {
  apiAuth.register(route);
  apiMe.register(route);
  apiInstances.register(route);
  apiAdmin.register(route);
}
```

## 文件分配

### API 路由文件

| 文件 | 路由 | 预估行数 |
|---|---|---|
| `api-auth.ts` | setup/register/login/logout/forgot/reset | ~150 |
| `api-me.ts` | /api/me, tokens CRUD | ~60 |
| `api-instances.ts` | /api/instances/* (CRUD + ops + logs) | ~150 |
| `api-admin.ts` | /admin/api/* (users/instances/audit/settings) | ~200 |

### 页面路由文件

| 文件 | 路由 | 预估行数 |
|---|---|---|
| `page-auth.ts` | /setup, /login, /register, /forgot-password, /reset-password | ~200 |
| `page-instances.ts` | /, /instances/* (list/new/detail/start/stop/restart/delete) | ~150 |
| `page-admin.ts` | /admin, /admin/* (dashboard/users/instances/audit/settings) | ~250 |

### 辅助函数归属

| 函数 | 归属 |
|---|---|
| `publicUser()` | `users.ts`（业务层） |
| `publicInstance()` | `instances.ts`（业务层） |
| `sessionCookiePairs()` / `clearSessionCookies()` | `sessions.ts`（业务层） |
| `validQuota()` / `clampInt()` | `routes/helpers.ts`（路由层共享） |
| `requireInstance()` | `routes/helpers.ts` |
| `withInstanceOp()` | `routes/helpers.ts` |

## 执行顺序

本变更应在 `logic-dedup` 之后执行。原因：
1. `logic-dedup` 会先清理 pages.ts 中的重复逻辑，使拆分更干净。
2. 拆分时不需要同时处理逻辑去重，降低单次变更风险。

## 不变更的部分

- 路由框架（`matchRoute`、`startServer`、`handlePageRequest`）保留在主文件。
- 中间件逻辑（鉴权、CSRF）保留在主文件。
- 所有路由的路径、方法、参数不变。
- 所有路由的响应格式不变。
