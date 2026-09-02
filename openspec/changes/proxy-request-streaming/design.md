# 代理请求端流式转发技术方案

## 当前实现

```typescript
// proxy.ts 当前逻辑
const body = req.method !== 'GET' && req.method !== 'HEAD'
  ? await readBody(req)   // ← 缓冲整个请求体
  : undefined;
const proxyReq = http.request(url, { method, headers });
if (body) proxyReq.write(body);  // ← 一次性写入
proxyReq.end();
```

## 改动方案

```typescript
// 改后：流式转发
const proxyReq = http.request(url, { method, headers });
if (req.method !== 'GET' && req.method !== 'HEAD') {
  req.pipe(proxyReq);  // ← 流式 pipe，边读边发
} else {
  proxyReq.end();
}
```

## 注意事项

- `req.pipe(proxyReq)` 会自动处理 backpressure（背压），不需要手动控制
- 错误处理：`req` 的 error 事件需要转发到 `proxyReq`，避免未捕获异常
- Content-Length 头：流式转发时由 Node.js 自动处理，不需要手动设置
