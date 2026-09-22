# DSH Deployment API Base 动态化

## Why

DSH 实例中安装的插件会发起 API 请求（如 `/status`、`/installed`、`/plugins/xxx/registry` 等），这些路径是动态的、不可预知的——用户可以随时安装/卸载插件，每个插件有自己的 API 端点。

当前 `dsh-deployment.js` 硬编码 `apiBase: '/'`，导致 DSH 前端所有 API 请求使用绝对路径（如 `fetch('/status')`），不包含实例前缀 `/i/<slug>-<id>/`。这些请求到达 DSH Hub 后无法被网关路由到正确的 DSH 实例，返回 404。

维护路径白名单不可行——插件路径是用户动态安装的，无法预知。唯一可持续的方案是让 DSH 前端自动为所有请求带上实例前缀。

## What Changes

1. **`gateway.ts`**：`/dsh-deployment.js` 从硬编码改为动态生成，从 Referer 提取实例路径，设置 `apiBase` 和 `wsBase` 为实例前缀
2. **禁用缓存**：`dsh-deployment.js` 响应添加 `Cache-Control: no-cache, no-store`，防止切换实例后使用错误的 `apiBase`

## Impact

- **修改文件**：`src/gateway.ts`（约 20 行改动）
- **不影响**：`api.ts`、`proxy.ts`、`subdomain.ts`、DSH 实例代码
- **向后兼容**：无 Referer 时 fallback 到空 `apiBase`，行为与当前一致
- **数据库**：无改动
