# 技术方案：WebSocket 事件通道代理

## 架构决策

### 决策 1：WebSocket Fallback 策略

**选择**：在 `handleGatewayWebSocket` 返回 false 后，尝试 `proxyWebSocketToDshInstance`

**理由**：
- 保持实例路径 WebSocket 的优先处理（所有权校验）
- 非实例路径 fallback 到用户运行中的实例
- 与 HTTP API fallback（`proxyToDshInstance`）保持一致的模式

### 决策 2：Host/Origin 头处理

**选择**：使用 loopback 地址（`127.0.0.1:port`）而非原始域名

**理由**：
- DSH 实例监听在本地，loopback 地址更准确
- 避免 Host/Origin 不匹配导致 403
- 与 HTTP 代理保持一致

## 关键代码变更

### gateway.ts

```typescript
export async function proxyWebSocketToDshInstance(
  database: DatabaseSync,
  req: IncomingMessage,
  socket: Socket,
  head: Buffer
): Promise<boolean> {
  const auth = authenticate(database, req);
  if (!auth) return false;
  
  const instances = listInstances(database, auth.user.id);
  const running = instances.find(i => i.status === 'running' && i.port);
  if (!running || !running.port) return false;
  
  const target: ProxyTarget = { host: '127.0.0.1', port: running.port };
  await proxyWebSocket(req, socket, head, target);
  return true;
}
```

### api.ts

```typescript
server.on('upgrade', async (req, socket, head) => {
  const handled = await handleGatewayWebSocket(req, socket as any, head);
  if (handled) return;
  // DSH WebSocket fallback
  const proxied = await proxyWebSocketToDshInstance(db, req, socket as any, head);
  if (proxied) return;
  socket.destroy();
});
```

### proxy.ts

```typescript
// WebSocket 代理
const hostHeader = `Host: ${target.host}:${target.port}\r\n`;
// 剥离 host 和 origin（后续单独设置）
if (lowerKey === 'host' || lowerKey === 'origin') continue;
```

## 安全性考虑

- WebSocket fallback 仍需认证（`authenticate(database, req)`）
- 仅代理到认证用户的运行中实例
- 未认证或无运行实例时返回 false，连接被销毁
