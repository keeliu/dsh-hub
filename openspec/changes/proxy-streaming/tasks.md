# Tasks: HTTP 代理流式转发

## 阶段 1：HTTP 代理改造

- [ ] 1.1 `proxyHttpRequest` 改为流式转发（`getReader()` 逐块写入）
- [ ] 1.2 添加错误处理（headersSent 判断）

## 阶段 2：WebSocket close frame

- [ ] 2.1 upstream error 时发送 close frame（code 1011）

## 阶段 3：验证

- [ ] 3.1 类型检查通过
- [ ] 3.2 冒烟测试通过
- [ ] 3.3 手动验证：大文件下载不占满内存
- [ ] 3.4 手动验证：SSE 流式响应正常
- [ ] 3.5 归档变更

## 预估时间

- 阶段 1：30 分钟
- 阶段 2：15 分钟
- 阶段 3：30 分钟
- **总计：1.25 小时**
