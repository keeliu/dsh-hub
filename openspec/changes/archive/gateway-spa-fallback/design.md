# 网关 SPA Fallback 技术方案

## 改动位置

`src/gateway.ts` 的 `handleGatewayRequest` 函数。

在 `parseInstancePath` 返回 null 之后、`return false` 之前，插入 SPA fallback 检查。

## 实现逻辑

```typescript
// handleGatewayRequest 中，parseInstancePath 返回 null 后：

// SPA fallback：DSH 实例是 SPA，客户端路由（如 /dsh-market/registry）
// 刷新时需要返回 index.html 让前端接管
if (pathname.startsWith('/i/') && (req.method === 'GET' || req.method === 'HEAD')) {
  const auth = authenticate(db, req);
  if (auth) {
    const instance = db.prepare(
      "SELECT * FROM instances WHERE owner_id = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1"
    ).get(auth.user.id) as InstanceRecord | undefined;
    if (instance) {
      const indexPath = join(instanceHomePath(instance), 'index.html');
      if (existsSync(indexPath)) {
        const html = readFileSync(indexPath);
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache',
        });
        res.end(html);
        return true;
      }
    }
  }
}

return false;
```

## 执行顺序

```
handleGatewayRequest(req, res, pathname)
  │
  ├─ ① /dsh-deployment.js → 动态生成（已有）
  ├─ ② /assets/、/plugins/ → 静态资源 fallback（已有）
  ├─ ③ parseInstancePath → 匹配实例路径 → 代理（已有）
  ├─  ✨ SPA fallback → /i/ 开头 + 认证 + running 实例 → 返回 index.html（新增）
  └─ ⑤ return false → 走 pages/api 路由（已有）
```

## 关键决策

### 为什么不硬编码 `/i/dsh-market/*`？

DSH 前端的 SPA 路由是动态的、不可预知的。今天有 `/dsh-market/registry`，明天可能有 `/dsh-settings`、`/dsh-plugins/xxx`。硬编码路径意味着每次 DSH 新增路由都要改 Hub 代码。

通用 SPA fallback 方案对所有 `/i/...` 路径生效，不需要维护路径列表。

### 为什么选最新的 running 实例？

用户可能有多个实例。SPA fallback 无法从路径中确定具体是哪个实例（因为路径不匹配实例格式）。选择最新的 running 实例是最合理的默认行为——用户最近使用的实例大概率就是他们想要的。

如果用户需要访问特定实例的 SPA 路由，应该通过完整的实例路径（`/i/{slug}-{id}/...`）访问，这会走正常的代理流程（步骤 ③）。

### 为什么只处理 GET/HEAD？

POST/PUT/DELETE 等写操作不应该被 SPA fallback 拦截。如果这些请求的路径不匹配实例格式，应该走后续的 API 路由或返回 404，而不是返回 HTML。

## 与 dsh-deployment-api-base 的配合

| 场景 | SPA fallback | 动态 apiBase |
|---|---|---|
| 刷新 `/i/dsh-market/registry` | 返回 index.html ✅ | 从 Referer 提取 apiBase ✅ |
| API 请求 `/status` | 不涉及 | apiBase 带实例前缀 ✅ |
| 直接访问 `/i/ceshijun-i-xxx/chat` | 不触发（匹配实例路径） | 正常代理 ✅ |

两个方案独立实现，互不依赖，但配合使用才能完整解决 DSH 实例的 404 问题。
