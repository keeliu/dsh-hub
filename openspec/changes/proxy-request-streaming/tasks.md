# 代理请求端流式转发实施清单

- [ ] 1.1 `proxy.ts` 的 `proxyHttpRequest` 改为 `req.pipe(proxyReq)` 流式转发
- [ ] 1.2 保留 GET/HEAD 请求的 `proxyReq.end()` 逻辑
- [ ] 1.3 添加 `req` → `proxyReq` 的错误转发处理
- [ ] 2.1 更新 `proxy.ts` 模块头注释
- [ ] 3.1 类型检查通过（`tsc --noEmit`）
