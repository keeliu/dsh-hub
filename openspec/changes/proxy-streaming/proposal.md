# Proposal: HTTP 代理流式转发

## Why

当前 `proxy.ts` 的 `proxyHttpRequest` 使用 `response.arrayBuffer()` 将整个 HTTP 响应体读入内存后一次性发送给客户端。问题：

1. **内存占用**：大文件下载（如用户上传的数据文件）会占用与文件大小等量的内存。
2. **首字节延迟**：必须等整个响应下载完毕才能开始发送，用户感知延迟 = 下载时间。
3. **流式协议不兼容**：SSE（Server-Sent Events）、chunked 流式响应等无法正常工作。

## What Changes

### HTTP 代理改为流式转发

使用 `response.body.getReader()` 逐块读取并写入 `res`：

```typescript
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  res.write(value);
}
res.end();
```

### WebSocket 代理增加 close frame

upstream error 时发送 WebSocket close frame（code 1011）后再关闭 socket。

## Impact

- **破坏性**：无。对外行为不变，只是内部实现优化。
- **影响范围**：`src/proxy.ts`
- **风险**：低。Node.js `fetch` 的 `ReadableStream` 是标准 API。
- **前置依赖**：无。
