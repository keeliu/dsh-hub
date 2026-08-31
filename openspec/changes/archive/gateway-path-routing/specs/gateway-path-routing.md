# Spec: 网关路径路由

## Feature: 路径解析

### Scenario: 解析实例访问路径
- **Given** 请求路径为 `/i/<slug>-<id>/...`
- **When** 解析路径
- **Then** 提取 slug 和 instanceId
- **And** 返回 `{ slug, instanceId, remainingPath }`

### Scenario: 非实例路径
- **Given** 请求路径不以 `/i/` 开头
- **When** 解析路径
- **Then** 返回 `null`，由控制面处理

## Feature: 网关路由

### Scenario: 实例访问入口
- **Given** 用户访问 `/i/<slug>-<id>`
- **And** 用户已登录且有权限
- **When** 网关处理请求
- **Then** 代理到对应实例

### Scenario: WebSocket 隧道
- **Given** 用户访问 `/i/<slug>-<id>/api/events.mux|host`
- **And** 是 WebSocket 升级请求
- **When** 网关处理请求
- **Then** 建立 WebSocket 隧道到实例

### Scenario: 实例未运行
- **Given** 用户访问 `/i/<slug>-<id>`
- **And** 实例状态为 stopped
- **When** 网关处理请求
- **Then** 返回引导页

### Scenario: 无权限访问
- **Given** 用户访问 `/i/<slug>-<id>`
- **And** 不是实例属主且不是管理员
- **When** 网关处理请求
- **Then** 返回 403 或 404

## Feature: 控制面路由

### Scenario: 控制面路径优先级
- **Given** 请求路径不以 `/i/` 开头
- **When** 路由匹配
- **Then** 优先匹配控制面路由（/login, /admin 等）
- **And** 未匹配则返回 404
