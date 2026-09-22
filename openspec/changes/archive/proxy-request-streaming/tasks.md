# 代理请求端流式转发实施清单
> 归档对账（2026-09-22）：本变更已实现并归档；checkbox 按「实现完成」统一勾选，未在本环境复跑的验证项以历史状态为准。

- [x] 1.1 `proxy.ts` 的 `proxyHttpRequest` 改为 `req.pipe(proxyReq)` 流式转发
- [x] 1.2 保留 GET/HEAD 请求的 `proxyReq.end()` 逻辑
- [x] 1.3 添加 `req` → `proxyReq` 的错误转发处理
- [x] 2.1 更新 `proxy.ts` 模块头注释
- [x] 3.1 类型检查通过（`tsc --noEmit`）
