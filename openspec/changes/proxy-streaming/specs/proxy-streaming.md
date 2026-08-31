# Spec: HTTP 代理流式转发

## Feature: 流式 HTTP 代理

### Scenario: 小响应正常转发
- GIVEN 上游返回 200 + 小 body（< 1KB）
- WHEN 代理转发
- THEN 客户端收到完整响应
- AND status code 和 headers 正确传递

### Scenario: 大响应流式转发
- GIVEN 上游返回 200 + 大 body（> 10MB）
- WHEN 代理转发
- THEN 客户端在首字节到达时即开始接收
- AND 内存占用不超过数 KB（不缓存整个 body）

### Scenario: 流式响应（SSE）正常转发
- GIVEN 上游返回 `Content-Type: text/event-stream`
- WHEN 代理转发
- THEN 每个 SSE 事件实时转发到客户端
- AND 不被缓冲

### Scenario: 上游错误返回 502
- GIVEN 上游连接失败或超时
- WHEN 代理转发
- THEN 客户端收到 502 Bad Gateway

## Feature: WebSocket close frame

### Scenario: 上游错误发送 close frame
- GIVEN WebSocket 连接已建立
- WHEN 上游连接出错
- THEN 向客户端发送 close frame（code 1011）
- AND 然后关闭 socket
