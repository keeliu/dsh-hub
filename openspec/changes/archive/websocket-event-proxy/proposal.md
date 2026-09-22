# 变更提案：WebSocket 事件通道代理

## Why

DSH 前端通过绝对路径连接 WebSocket 事件通道（`/api/events.mux`、`/api/events.host`），这些请求不经过 `/i/` 实例路径前缀。Hub 的 WebSocket 升级处理器只识别实例路径，导致非实例路径的 WebSocket 连接被直接销毁，DSH 前端无法建立事件通道，设置页面报错 "settings are unavailable in this browser"。

## What Changes

1. 在 `gateway.ts` 中新增 `proxyWebSocketToDshInstance()` 函数，处理非实例路径的 WebSocket 连接
2. 在 `api.ts` 的 upgrade 事件中增加 WebSocket fallback 逻辑
3. 修复 `proxy.ts` 中 WebSocket 代理的 Host/Origin 头处理

## Impact

- **受影响模块**：`gateway.ts`、`api.ts`、`proxy.ts`
- **用户可见**：设置页面能正常加载模型提供方目录
- **向后兼容**：是，不影响现有实例路径的 WebSocket 代理
