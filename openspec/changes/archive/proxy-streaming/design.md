# Design: HTTP 代理流式转发

## HTTP 代理改造

### 改造前

```typescript
const response = await fetch(url, { method, headers, body });
const body = await response.arrayBuffer();
res.end(Buffer.from(body));
```

### 改造后

```typescript
const response = await fetch(url, { method, headers, body });
res.statusCode = response.status;
for (const [key, value] of response.headers) {
  if (key.toLowerCase() !== 'transfer-encoding') {
    res.setHeader(key, value);
  }
}
if (response.body) {
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
}
res.end();
```

### 错误处理

```typescript
try {
  // ... 流式转发 ...
} catch (err) {
  if (!res.headersSent) {
    res.statusCode = 502;
    res.end('Bad Gateway');
  } else {
    res.destroy();
  }
}
```

## WebSocket close frame

```typescript
upstream.on('error', (err) => {
  // 发送 WebSocket close frame (1011 Internal Error)
  const closeFrame = Buffer.alloc(2);
  closeFrame.writeUInt16BE(1011, 0);
  try { socket.write(closeFrame); } catch { /* ignore */ }
  socket.destroy();
});
```

## 不变更的部分

- `proxyWebSocket` 的 pipe 逻辑不变（已经是流式的）。
- `stripPrefix` 逻辑不变。
- `ProxyTarget` 接口不变。
