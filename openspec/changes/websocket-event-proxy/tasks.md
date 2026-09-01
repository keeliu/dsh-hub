# 实施清单：WebSocket 事件通道代理

## 任务列表

- [x] 在 `gateway.ts` 中新增 `proxyWebSocketToDshInstance()` 函数
- [x] 在 `api.ts` 的 upgrade 事件中增加 WebSocket fallback 逻辑
- [x] 修复 `proxy.ts` 中 WebSocket 代理的 Host/Origin 头处理
- [x] 添加调试日志（后续清理）
- [x] 修复 `console.log` 引用未声明变量的 bug（ReferenceError → 502）
- [x] 类型检查通过
- [x] 推送到 Git

## 验证

- [ ] WebSocket 连接到 `/api/events.mux` 成功（101 Switching Protocols）
- [ ] WebSocket 连接到 `/api/events.host` 成功
- [ ] 设置页面能正常加载模型提供方目录
- [ ] 实例路径的 WebSocket 代理不受影响
