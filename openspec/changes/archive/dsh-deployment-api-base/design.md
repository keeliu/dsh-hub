# DSH Deployment API Base 动态化技术方案

## 问题本质

DSH 插件的 API 路径是用户动态安装的、完全不可预知的。任何基于路径白名单的方案都不可持续。

**唯一可持续的方案**：让 DSH 前端自动为所有请求带上实例前缀。这只需要改 `apiBase` 的值。

## 方案

### 当前行为

```javascript
// gateway.ts 硬编码返回
window.__DSH_DEPLOYMENT__ = {
  apiBase: '/',
  wsBase: '/',
  version: 'hub-proxy'
};
```

DSH 前端请求：`fetch('/' + 'status')` → `fetch('/status')` → 404

### 改后行为

```javascript
// gateway.ts 从 Referer 提取实例路径，动态生成
// Referer: https://hub.wuyajun.cn/i/ceshijun-i-ef4a425e/
window.__DSH_DEPLOYMENT__ = {
  apiBase: '/i/ceshijun-i-ef4a425e',
  wsBase: '/i/ceshijun-i-ef4a425e',
  version: 'hub-proxy'
};
```

DSH 前端请求：`fetch('/i/ceshijun-i-ef4a425e' + '/status')` → 网关正确代理 ✅

### 实现逻辑

```typescript
// gateway.ts handleGatewayRequest 中 /dsh-deployment.js 分支
if (pathname === '/dsh-deployment.js') {
  const referer = req.headers.referer ?? '';
  const refererUrl = new URL(referer, 'http://localhost');
  const instancePath = parseInstancePath(refererUrl.pathname);

  let apiBase = '';
  let wsBase = '';
  if (instancePath) {
    const prefix = `/i/${instancePath.userSlug}-${instancePath.instanceId}`;
    apiBase = prefix;
    wsBase = prefix;
  }

  const js = `window.__DSH_DEPLOYMENT__={apiBase:${JSON.stringify(apiBase)},wsBase:${JSON.stringify(wsBase)},version:'hub-proxy'};`;
  res.writeHead(200, {
    'Content-Type': 'application/javascript',
    'Cache-Control': 'no-cache, no-store',
  });
  res.end(js);
  return true;
}
```

### 关键决策

**为什么用 Referer 而不是 URL 路径？**

`/dsh-deployment.js` 的请求路径本身不包含实例信息（DSH 前端从根路径加载此脚本）。唯一能知道"哪个实例在请求这个脚本"的线索是 `Referer` 头——浏览器会自动带上当前页面 URL。

**为什么不禁用 Referer 检查？**

如果用户直接访问 `/dsh-deployment.js`（无 Referer），fallback 到空 `apiBase`，行为与当前一致。不会破坏任何现有功能。

**为什么需要禁用缓存？**

用户可能有多个实例。如果浏览器缓存了实例 A 的 `dsh-deployment.js`（`apiBase: '/i/userA-i-xxx'`），切换到实例 B 时会用错误的 `apiBase`，导致所有请求路由到实例 A。

## 影响范围

| 组件 | 影响 |
|---|---|
| `gateway.ts` | 修改 `/dsh-deployment.js` 处理逻辑（~20 行） |
| `api.ts` | 无改动 |
| `proxy.ts` | 无改动 |
| `subdomain.ts` | 无改动 |
| DSH 实例 | 无改动 |
| 数据库 | 无改动 |
| 前端页面 | 无改动 |
