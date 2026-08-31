# Design: 网关路径路由

## 架构变更

### 变更前（子域名）
```
<slug>-<id>.hub.wuyajun.cn → 解析子域名 → 代理到实例
```

### 变更后（路径）
```
hub.wuyajun.cn/i/<slug>-<id> → 解析路径 → 代理到实例
```

## 路由规则

| 路径 | 处理 |
|---|---|
| `/i/<slug>-<id>` | 网关：鉴权 + 代理到实例 |
| `/i/<slug>-<id>/api/events.mux\|host` | 网关：WebSocket 隧道 |
| `/i/<slug>-<id>/...` | 网关：代理到实例 |
| `/login`, `/register`, `/setup` | 控制面：认证页面 |
| `/admin/...` | 控制面：管理后台 |
| `/api/...` | 控制面：API 接口 |
| 其他 | 404 |

## 模块变更

### 1. `src/routing.ts`（原 `subdomain.ts`）

```typescript
export interface ParsedInstancePath {
  slug: string;
  instanceId: string;
  remainingPath: string;
}

export function parseInstancePath(pathname: string): ParsedInstancePath | null {
  // 匹配 /i/<slug>-<id> 或 /i/<slug>-<id>/...
  const match = pathname.match(/^\/i\/([a-zA-Z0-9_-]+)-([a-f0-9]+)(\/.*)?$/);
  if (!match) return null;
  
  return {
    slug: match[1],
    instanceId: match[2],
    remainingPath: match[3] || '/'
  };
}
```

### 2. `src/gateway.ts`

更新路由匹配逻辑：
- 从子域名解析改为路径解析
- 使用 `parseInstancePath` 替代 `parseInstanceSubdomain`

### 3. `src/api.ts`

更新路由优先级：
```typescript
// 1. 健康检查
if (pathname === '/healthz') ...

// 2. 实例路径（/i/<slug>-<id>）
const parsed = parseInstancePath(pathname);
if (parsed) {
  // 网关处理
}

// 3. API 路由
if (pathname.startsWith('/api/')) ...

// 4. 页面路由
// ...
```

## 安全考虑

- 路径中的 slug 和 instanceId 需要严格校验
- 防止路径遍历攻击
- WebSocket 升级请求需要正确识别

## 迁移方案

1. 部署新代码
2. 更新 Caddy/Nginx 配置（移除子域名配置）
3. 通知用户新的访问方式
