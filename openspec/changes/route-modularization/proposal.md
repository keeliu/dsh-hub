# Proposal: 路由层模块化拆分

## Why

当前 `api.ts`（765 行）和 `pages.ts`（684 行）各自承载了所有路由声明、参数提取、响应格式化。随着功能增长（M4 管理 UI、M5 加固等），这两个文件会持续膨胀，违反 standards.md §2 的文件体量上限（300 行）。

拆分目标：
- 每个路由文件不超过 300 行。
- 按领域组织，新增功能时能快速定位对应文件。
- 路由文件只放路由声明和轻量的参数提取，业务逻辑调用业务层函数。

## What Changes

### 目录结构

```
src/
├── routes/
│   ├── api-auth.ts        # POST /api/auth/*（setup/register/login/logout/forgot/reset）
│   ├── api-me.ts          # GET /api/me, /api/me/tokens/*
│   ├── api-instances.ts   # /api/instances/*（CRUD + start/stop/restart/logs）
│   ├── api-admin.ts       # /admin/api/*（users/instances/audit/settings）
│   ├── page-auth.ts       # /setup, /login, /register, /forgot-password, /reset-password
│   ├── page-instances.ts  # /, /instances/*（用户端实例页面）
│   ├── page-admin.ts      # /admin, /admin/*（管理后台页面）
│   └── index.ts           # registerApiRoutes() + registerPageRoutes() 聚合
├── views/
│   ├── layout.ts          # 布局框架 + nav + csrf（~200 行）
│   ├── styles.ts          # CSS 字符串（~400 行）
│   ├── components.ts      # 通用组件（flash/alert/form）（~200 行）
│   ├── icons.ts           # SVG 图标（~200 行）
│   ├── auth.ts            # 认证页面（登录/注册/找回密码）
│   ├── user.ts            # 用户页面（实例列表/会员/个人中心）
│   └── admin.ts           # 管理页面（用户管理/实例总览/设置）
├── api.ts                 # 精简为：路由框架 + startServer() + 调用 routes/index.ts
├── pages.ts               # 精简为：handlePageRequest() + 调用 routes/index.ts
```

### 拆分原则

- 每个路由文件导出 `register(fn)` 函数，接收路由注册回调。
- 主文件（`api.ts`/`pages.ts`）保留路由框架（`matchRoute`、`startServer`、`handlePageRequest`）和中间件逻辑（鉴权、CSRF），不再包含具体路由。
- 辅助函数（`publicUser`、`publicInstance`、`sessionCookiePairs` 等）提取到对应的业务层或 `routes/helpers.ts`。

## Impact

- **破坏性**：无。纯内部重构，不改变任何公共 API 或 URL。
- **影响范围**：`src/api.ts`、`src/pages.ts`、`src/views/layout.ts`、新增 `src/routes/` 目录、新增 `src/views/styles.ts`、`src/views/components.ts`、`src/views/icons.ts`
- **风险**：中。文件移动和 import 路径变更需要仔细验证。建议在 `logic-dedup` 之后执行（此时 pages.ts 已瘦身，拆分更干净）。
