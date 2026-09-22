# 代理请求端流式转发

## Why

当前 `proxy.ts` 的响应端已使用 `proxyRes.pipe(res)` 流式转发，但请求端仍用 `await readBody(req)` 将整个请求体缓冲到内存再发送。对于大文件上传（如 DSH 实例中的文件上传场景），这会导致：
- 内存占用与请求体大小成正比
- 首字节延迟增加（必须等整个请求体读完才转发）
- 大请求可能触发内存限制

## What Changes

1. `proxy.ts` 的 `proxyHttpRequest` 改为请求端流式转发：`req.pipe(proxyReq)`
2. 保留 GET/HEAD 请求的 `proxyReq.end()` 逻辑
3. 更新 `proxy.ts` 模块头注释

## Impact

- **修改文件**：`src/proxy.ts`
- **不影响**：WebSocket 代理（已流式）、响应端转发（已流式）、API 路由
