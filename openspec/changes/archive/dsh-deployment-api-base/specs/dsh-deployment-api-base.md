# DSH Deployment API Base 动态化规范

## 术语

- **实例前缀**：`/i/<userSlug>-<instanceId>`，网关路由的 URL 前缀
- **apiBase**：DSH 前端所有 API 请求的 URL 前缀，定义在 `window.__DSH_DEPLOYMENT__.apiBase`
- **wsBase**：DSH 前端 WebSocket 连接的 URL 前缀，定义在 `window.__DSH_DEPLOYMENT__.wsBase`

## 动态生成规则

Given 浏览器请求 `/dsh-deployment.js`

When 网关收到请求

Then 执行以下逻辑：

1. 读取 `Referer` 请求头
2. 如果 Referer 匹配实例路径格式 `/i/<slug>-<id>/...`：
   - 提取实例前缀 `/i/<slug>-<id>`
   - 生成 JS：`apiBase: '<实例前缀>'`, `wsBase: '<实例前缀>'`
3. 如果 Referer 为空或不匹配实例路径：
   - 生成 JS：`apiBase: ''`, `wsBase: ''`（向后兼容）
4. 响应头设置 `Cache-Control: no-cache, no-store`
5. 响应头设置 `Content-Type: application/javascript`

## 效果验证

Given 用户在实例页面 `/i/ceshijun-i-ef4a425e/` 中安装了任意插件

When 插件发起 API 请求（如 `fetch('/status')`、`fetch('/plugins/xxx/registry')`）

Then DSH 前端实际请求 URL 为：
- `fetch('/i/ceshijun-i-ef4a425e/status')` → 网关正确解析并代理到 DSH 实例
- `fetch('/i/ceshijun-i-ef4a425e/plugins/xxx/registry')` → 同上

## 向后兼容

Given 用户直接访问 `/dsh-deployment.js`（无 Referer）

When 网关收到请求

Then 返回 `apiBase: ''`，DSH 前端行为与当前硬编码 `apiBase: '/'` 等效（所有请求为绝对路径）

## 安全约束

- 实例前缀从 Referer 提取，不做数据库查询（轻量、无副作用）
- 不信任 Referer 中的用户身份信息，仅提取路径格式
- 响应中不包含任何敏感信息（仅 `apiBase`、`wsBase`、`version`）
