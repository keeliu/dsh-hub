# M3: 鉴权网关技术方案

## 架构概览

```
浏览器 → Caddy (TLS/泛域名) → DSH Hub 控制面 (Node.js)
                                    ├── 管理面 API/UI (现有)
                                    ├── 鉴权网关 (M3 新增)
                                    │    ├── 子域名解析
                                    │    ├── 鉴权校验
                                    │    ├── HTTP 反向代理
                                    │    └── WebSocket 隧道
                                    └── 实例监督器 (现有)
                                         ↓
                                    127.0.0.1:4000+ (dsh web 实例)
```

## 核心模块设计

### 1. 子域名解析 (`src/subdomain.ts`)

```typescript
interface ParsedSubdomain {
  slug: string;      // 用户 slug，如 "alice"
  instanceId: string; // 实例 ID，如 "i-abc123"
}

function parseSubdomain(host: string, domain: string): ParsedSubdomain | null {
  // 从 "alice-i-abc123.hub.wuyajun.cn" 解析出 slug 和 instanceId
  // 格式: <slug>-<instanceId>.<domain>
}
```

### 2. 鉴权网关 (`src/gateway.ts`)

```typescript
interface GatewayContext {
  user: UserInfo | null;
  instance: InstanceRow | null;
  parsed: ParsedSubdomain | null;
}

async function handleGateway(req, res, ctx: GatewayContext) {
  // 1. 鉴权校验（session/token）
  // 2. 所有权校验（实例属主）
  // 3. 实例状态检查
  //    - 未运行 → 返回引导页
  //    - 运行中 → 反向代理
  // 4. WebSocket 升级请求 → 隧道
}
```

### 3. HTTP 反向代理 (`src/proxy.ts`)

```typescript
function proxyHttpRequest(req, res, targetUrl: string) {
  // 使用 http.request 转发请求
  // 处理响应头、状态码、body
}

function proxyWebSocket(req, socket, head, targetUrl: string) {
  // 使用 net.connect 建立 TCP 连接
  // 双向 pipe 数据流
}
```

### 4. 引导页 (`src/pages.ts`)

```typescript
function renderInstanceGuidePage(instance: InstanceRow, user: UserInfo): string {
  // 返回 HTML 引导页
  // - 展示实例状态（已停止/启动中）
  // - 提供启动按钮
  // - 自动轮询状态
}
```

## 路由集成

在 `src/index.ts` 中，根据 Host 头判断请求类型：

```typescript
const server = http.createServer(async (req, res) => {
  const host = req.headers.host || '';
  
  // 判断是否为实例子域名
  if (isInstanceSubdomain(host, config.domain)) {
    await handleGateway(req, res, ctx);
    return;
  }
  
  // 否则走现有 API/UI 路由
  await handleApi(req, res);
});
```

## 鉴权流程

```
1. 解析子域名 → 获取 slug + instanceId
2. 查询实例 → 获取实例信息 + 属主 ID
3. 鉴权校验：
   a. 检查 session cookie → 获取 user
   b. 或检查 Authorization: Bearer <token> → 获取 user
   c. 未登录 → 重定向 /login?redirect=<url>
4. 所有权校验：
   a. 实例属主 = 当前用户 → 通过
   b. 或当前用户角色 = admin/root → 通过
   c. 否则 → 403 Forbidden
5. 实例状态检查：
   a. running → 反向代理
   b. stopped → 引导页
   c. starting → 引导页（启动中状态）
6. WebSocket 升级请求 → 隧道
```

## WebSocket 隧道实现

```typescript
function handleWebSocketUpgrade(req, socket, head, targetPort: number) {
  const targetSocket = net.connect(targetPort, '127.0.0.1', () => {
    // 构造 WebSocket 握手请求
    targetSocket.write(`GET ${req.url} HTTP/1.1\r\n`);
    targetSocket.write(`Host: 127.0.0.1:${targetPort}\r\n`);
    // ... 转发其他头部
    targetSocket.write('\r\n');
    if (head.length > 0) targetSocket.write(head);
    
    // 双向 pipe
    socket.pipe(targetSocket);
    targetSocket.pipe(socket);
  });
  
  targetSocket.on('error', () => socket.destroy());
  socket.on('error', () => targetSocket.destroy());
}
```

## 自动实例创建

在 `src/api.ts` 的注册成功后：

```typescript
async function handleRegister(req, res) {
  // ... 现有注册逻辑
  
  // 注册成功后自动创建实例
  const instance = await createInstance({
    ownerId: user.id,
    name: `${user.nickname} 的实例`,
    description: '自动创建的默认实例',
  });
  
  // 自动启动实例
  await startInstance(instance.id);
  
  // 返回实例访问地址
  const instanceUrl = `https://${user.slug}-${instance.id}.${config.domain}`;
  sendJson(res, 201, { user, instance, instanceUrl });
}
```

## 引导页设计

```html
<!DOCTYPE html>
<html>
<head>
  <title>实例已停止 - DSH Hub</title>
  <style>
    /* 内联样式，DSH 设计令牌 */
  </style>
</head>
<body>
  <div class="container">
    <h1>实例已停止</h1>
    <p>您的实例当前处于停止状态</p>
    <button onclick="startInstance()">启动实例</button>
  </div>
  <script>
    async function startInstance() {
      await fetch('/api/instances/{{instanceId}}/start', { method: 'POST' });
      // 轮询状态或刷新页面
    }
  </script>
</body>
</html>
```

## 配置变更

### 环境变量

```bash
# .env 或启动命令
DSH_HUB_DOMAIN=hub.wuyajun.cn
```

### Caddy 配置（泛域名 SSL）

```
*.hub.wuyajun.cn {
  tls /path/to/cert.pem /path/to/key.pem
  reverse_proxy 127.0.0.1:5000
}
```

## 安全考虑

1. **子域名劫持防护**：严格校验子域名格式，拒绝非法字符
2. **鉴权强制**：所有实例子域名访问必须经过鉴权
3. **WebSocket 鉴权**：升级请求前校验 session/token
4. **实例隔离**：用户只能访问自己的实例（管理员除外）
5. **速率限制**：防止恶意请求导致网关过载

## 性能考虑

1. **连接池**：复用 HTTP 连接，减少握手开销
2. **WebSocket 长连接**：保持隧道，避免频繁重建
3. **缓存**：实例信息缓存，减少数据库查询
4. **超时控制**：代理请求设置合理超时，防止资源泄漏

## 测试计划

1. **单元测试**：子域名解析、鉴权逻辑
2. **集成测试**：网关路由、WebSocket 隧道
3. **冒烟测试**：端到端访问流程
4. **压力测试**：高并发代理性能
