# 网关 SPA Fallback 规范

## 背景

DSH 实例是 SPA 应用，前端路由（如 `/dsh-market/registry`）在页面刷新或直接访问时需要服务器返回 `index.html`，由前端 JS 接管路由。

当前网关只识别 `/i/{userSlug}-{i-8位hex}/...` 格式的实例路径，其他 `/i/...` 路径直接返回 404。

## 触发条件

Given 一个 HTTP 请求到达 DSH Hub

When 同时满足以下条件：
1. 请求路径以 `/i/` 开头
2. `parseInstancePath` 返回 null（不匹配 `INSTANCE_PATH_RE`）
3. 请求方法为 `GET` 或 `HEAD`
4. 用户已通过认证（session cookie 或 Bearer token）
5. 用户至少有一个 `status = 'running'` 的实例

Then 执行 SPA fallback：返回该实例的 `index.html`

## SPA Fallback 行为

Given 触发 SPA fallback

When 返回响应

Then：
1. 选择用户最新的 running 实例（`ORDER BY created_at DESC LIMIT 1`）
2. 读取该实例 home 目录下的 `index.html` 文件
3. 如果 `index.html` 不存在，返回 false（走后续 404 流程）
4. 如果存在，返回 `200 OK`，`Content-Type: text/html; charset=utf-8`
5. 响应头设置 `Cache-Control: no-cache`（避免 SPA shell 被缓存导致版本不一致）

## 不触发 fallback 的情况

Given 一个 HTTP 请求

When 以下任一条件成立：
- 路径不以 `/i/` 开头
- `parseInstancePath` 返回非 null（正常实例路径，走代理流程）
- 请求方法不是 GET 或 HEAD（POST/PUT/DELETE 等写操作不 fallback）
- 用户未认证
- 用户没有 running 实例
- 实例的 `index.html` 文件不存在

Then 不执行 SPA fallback，返回 false，走后续路由流程

## 与动态 apiBase 的关系

Given 用户访问 DSH 实例

When 两种场景：

1. **页面刷新/直接访问**（如浏览器地址栏输入 `/i/dsh-market/registry`）
   - SPA fallback 返回 `index.html`
   - 浏览器加载 `index.html` 中的 `<script src="/dsh-deployment.js">`
   - 动态 apiBase 从 Referer 提取实例路径
   - DSH 前端用正确的 `apiBase` 发起 API 请求

2. **SPA 内导航**（用户在 DSH 界面内点击链接）
   - 前端 router 处理，不发起服务器请求
   - API 请求通过动态 `apiBase` 带上实例前缀

Then 两种方案互补，共同解决 DSH 实例的页面和 API 404 问题

## 安全约束

- SPA fallback 只在用户已认证时触发，未认证用户仍然看到 404 或登录页
- 不暴露实例的文件系统结构（只返回 `index.html`，不返回其他文件）
- 不代理静态资源请求（`/assets/`、`/plugins/` 已有独立的 fallback 处理）
