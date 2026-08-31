# Proposal: 网关路由方式从子域名改为路径

## Why

当前使用子域名方式 `<slug>-<id>.hub.wuyajun.cn` 访问实例，需要：
- 配置泛域名 DNS（`*.hub.wuyajun.cn`）
- 申请泛域名 SSL 证书（`*.hub.wuyajun.cn`）
- Caddy/Nginx 配置复杂

改用路径方式 `hub.wuyajun.cn/<slug>-<id>` 可以：
- 只需一个普通域名和 SSL 证书
- DNS 配置简单
- 路径更直观，易于分享

## What Changes

### 路由方式变更

| 项目 | 变更前 | 变更后 |
|---|---|---|
| 实例访问 URL | `<slug>-<id>.hub.wuyajun.cn` | `hub.wuyajun.cn/i/<slug>-<id>` |
| WebSocket 隧道 | `<slug>-<id>.hub.wuyajun.cn/api/events.mux\|host` | `hub.wuyajun.cn/i/<slug>-<id>/api/events.mux\|host` |
| 引导页 | 子域名根路径 | `/i/<slug>-<id>` |

### 路由规则

- `/i/<slug>-<id>` → 实例访问入口（鉴权 + 代理）
- `/i/<slug>-<id>/api/events.mux|host` → WebSocket 隧道
- `/i/<slug>-<id>/...` → 代理到 dsh 实例
- 其他路径 → 控制面（登录/注册/管理后台）

### 模块变更

- `src/subdomain.ts` → 重命名为 `src/routing.ts`，改为路径解析
- `src/gateway.ts` → 更新路由匹配逻辑
- `src/api.ts` → 更新路由优先级

## Impact

### 兼容性

- **破坏性变更**：已部署的实例访问 URL 会变化
- 需要通知用户新的访问方式

### 优势

- 无需泛域名 SSL 证书
- DNS 配置简单
- 路径更直观

### 部署

- 需要更新 Caddy/Nginx 配置
- 重新部署服务
