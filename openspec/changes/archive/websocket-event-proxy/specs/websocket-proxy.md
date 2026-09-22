# 功能规范：WebSocket 事件通道代理

## 场景 1：DSH 前端连接事件通道

**Given** 用户已登录且有一个运行中的 DSH 实例  
**When** DSH 前端尝试连接 `wss://hub.wuyajun.cn/api/events.mux`  
**Then** Hub 应代理该 WebSocket 连接到用户的 DSH 实例  
**And** 连接状态应为 101 Switching Protocols

## 场景 2：未认证用户的 WebSocket 连接

**Given** 用户未登录或 session 过期  
**When** 尝试连接 `wss://hub.wuyajun.cn/api/events.mux`  
**Then** `proxyWebSocketToDshInstance` 应返回 false  
**And** 连接应被销毁

## 场景 3：无运行中实例的 WebSocket 连接

**Given** 用户已认证但没有运行中的实例  
**When** 尝试连接 `wss://hub.wuyajun.cn/api/events.mux`  
**Then** `proxyWebSocketToDshInstance` 应返回 false  
**And** 连接应被销毁

## 场景 4：实例路径的 WebSocket 连接（不受影响）

**Given** 用户已登录且有一个运行中的实例  
**When** 连接 `wss://hub.wuyajun.cn/i/user-i-xxx/api/events.mux`  
**Then** `handleGatewayWebSocket` 应处理该连接（所有权校验）  
**And** `proxyWebSocketToDshInstance` 不应被调用

## 场景 5：Host/Origin 头处理

**Given** WebSocket 代理到 DSH 实例  
**When** 发送 WebSocket 升级请求  
**Then** Host 头应为 `127.0.0.1:{port}`  
**And** Origin 头应被剥离（不转发原始 Origin）
