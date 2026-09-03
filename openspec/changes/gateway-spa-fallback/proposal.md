# 网关 SPA Fallback：解决 DSH 实例客户端路由 404

## Why

DSH 实例是一个 SPA（单页应用），前端有自己的路由系统（如插件市场 `/dsh-market/registry`）。当用户在 DSH 界面内导航到这些路由时，浏览器地址栏变为 `/i/dsh-market/registry`。如果用户刷新页面或直接访问该 URL，请求会到达 DSH Hub 服务器。

当前 `parseInstancePath` 的正则要求路径格式为 `/i/{userSlug}-{i-8位hex}/...`，而 `/i/dsh-market/registry` 不匹配此格式（`dsh-market` 不是 `{slug}-{i-hex}` 模式）。请求既不被识别为实例代理路径，也不匹配任何页面路由，最终返回 404。

这导致用户无法使用 DSH 实例的插件市场功能（registry、installed、updates 均 404），且未来 DSH 新增任何 SPA 路由都会遇到同样问题。

## What Changes

1. **`gateway.ts` 新增 SPA fallback 逻辑**：在 `parseInstancePath` 返回 null 后，检查路径是否以 `/i/` 开头，若是则尝试返回用户 running 实例的 `index.html`
2. **不影响现有逻辑**：匹配 `INSTANCE_PATH_RE` 的路径仍走正常代理流程；非 `/i/` 开头的路径不受影响

## Impact

- **修改文件**：`src/gateway.ts`（约 20 行新增）
- **不影响**：`api.ts`、`pages.ts`、`proxy.ts`、`subdomain.ts`
- **互补方案**：与 `dsh-deployment-api-base` 提案（动态 apiBase）配合，完整解决 DSH 实例 404 问题
- **向后兼容**：无 Referer 或无 running 实例时 fallback 到现有 404 行为
