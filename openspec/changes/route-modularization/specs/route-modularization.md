# Spec: 路由层模块化拆分

## Feature: API 路由拆分

### Scenario: API 路由按领域分文件
- GIVEN `src/routes/` 目录存在
- WHEN 查看 API 路由定义
- THEN 认证路由在 `api-auth.ts`
- AND 用户信息/token 路由在 `api-me.ts`
- AND 实例路由在 `api-instances.ts`
- AND 管理路由在 `api-admin.ts`

### Scenario: 路由注册聚合
- GIVEN `src/routes/index.ts`
- WHEN 服务启动
- THEN 调用 `registerApiRoutes(route)` 注册所有 API 路由
- AND `api.ts` 的 `routes` 数组包含所有路由

## Feature: 页面路由拆分

### Scenario: 页面路由按领域分文件
- GIVEN `src/routes/` 目录存在
- WHEN 查看页面路由定义
- THEN 认证页面在 `page-auth.ts`
- AND 用户实例页面在 `page-instances.ts`
- AND 管理后台页面在 `page-admin.ts`

### Scenario: 页面路由注册聚合
- GIVEN `src/routes/index.ts`
- WHEN 页面请求到达
- THEN 调用 `registerPageRoutes(page)` 注册所有页面路由
- AND `handlePageRequest` 能匹配所有页面路由

## Feature: 主文件精简

### Scenario: api.ts 不超过 300 行
- GIVEN 路由拆分完成
- WHEN 统计 `api.ts` 行数
- THEN 行数 ≤ 300
- AND 仅包含路由框架（matchRoute、startServer）和中间件（鉴权、CSRF）

### Scenario: pages.ts 不超过 300 行
- GIVEN 路由拆分完成
- WHEN 统计 `pages.ts` 行数
- THEN 行数 ≤ 300
- AND 仅包含 `handlePageRequest` 分发逻辑

## Feature: 路由文件规范

### Scenario: 路由文件只包含声明
- GIVEN 任意 `routes/*.ts` 文件
- WHEN 查看文件内容
- THEN 包含路由声明（`route()` 或 `page()` 调用）
- AND 包含轻量的参数提取和响应格式化
- AND 不包含业务逻辑（业务逻辑在业务层函数中）
- AND 行数 ≤ 300
