# Workspace 直接嵌入规范

## 术语

- **Workspace 前缀**：`/workspace`，所有 DSH 实例请求的统一前缀
- **响应体重写**：将实例返回的 HTML/CSS/JS 中的绝对路径替换为带 `/workspace` 前缀的路径
- **SPA fallback**：当请求路径在实例上不是真实文件时，返回 index.html 让前端 JS 接管路由

## 路由规则

### 入口路由

Given 已认证且有会员的用户访问 `GET /workspace`

When 请求到达

Then 系统执行：
1. 查找用户的 running 状态实例
2. 如果没有 running 实例 → 自动调用 start → 返回 loading 页面（含轮询 JS）
3. 如果有 running 实例 → 获取实例的 `index.html`
4. 重写 HTML 中所有资源路径（`/assets/` → `/workspace/assets/`，`/plugins/` → `/workspace/plugins/`）
5. 在 `<head>` 中注入 `<script>window.__DSH_DEPLOYMENT__ = { apiBase: '/workspace', wsBase: '/workspace' };</script>`
6. 返回修改后的 HTML（Content-Type: text/html）

### 静态资源代理

Given 浏览器请求 `GET /workspace/assets/main.js`

When 请求到达

Then 系统执行：
1. 去掉 `/workspace` 前缀 → `/assets/main.js`
2. 代理到用户的 DSH 实例
3. 如果响应是 CSS 文件 → 重写其中的 `url(/...)` 为 `url(/workspace/...)`
4. 返回响应（保持原始 Content-Type）

### API 代理

Given 浏览器请求 `POST /workspace/api/host.info`

When 请求到达

Then 系统执行：
1. 去掉 `/workspace` 前缀 → `/api/host.info`
2. 代理到用户的 DSH 实例
3. 返回响应（JSON，不重写）

### SPA 路由 fallback

Given 浏览器请求 `GET /workspace/chat`（DSH 前端客户端路由）

When 请求到达

Then 系统执行：
1. 检查 `/chat` 是否是实例上的真实文件 → 否
2. 返回重写后的 `index.html`（同入口路由逻辑）
3. DSH 前端 JS 加载后解析 URL → 渲染聊天页面

### WebSocket 代理

Given 浏览器发起 WebSocket 连接到 `/workspace/ws`

When 连接建立

Then 系统执行：
1. 去掉 `/workspace` 前缀 → `/ws`
2. 代理 WebSocket 到用户的 DSH 实例
3. 双向转发消息

## 响应体重写规则

### HTML 重写

| 原始路径 | 重写后 | 匹配模式 |
|---|---|---|
| `/assets/main.js` | `/workspace/assets/main.js` | `<script src="/assets/...">` |
| `/assets/style.css` | `/workspace/assets/style.css` | `<link href="/assets/...">` |
| `/plugins/xxx/icon.png` | `/workspace/plugins/xxx/icon.png` | `<img src="/plugins/...">` |
| `/favicon.ico` | `/workspace/favicon.ico` | `<link rel="icon" href="/favicon.ico">` |

### CSS 重写

| 原始路径 | 重写后 | 匹配模式 |
|---|---|---|
| `url(/assets/font.woff)` | `url(/workspace/assets/font.woff)` | CSS 中的 `url(/...)` |

### 不重写的路径

- 外部 URL（`https://...`、`http://...`）
- 相对路径（`./main.js`、`../assets/style.css`）
- data URI（`data:image/png;base64,...`）
- 锚点（`#section`）

## 安全约束

- 只有已认证且有会员的用户才能访问 `/workspace`
- 代理请求必须验证实例所有权（用户只能访问自己的实例）
- 响应体重写只在 Content-Type 为 `text/html` 或 `text/css` 时执行
- 不重写 JSON、图片、二进制文件的响应体
- WebSocket 代理复用现有的鉴权逻辑（session cookie）

## 付费后自动进入 Workspace

### 支付回调成功后

Given 用户支付成功，虎皮椒回调 `POST /api/payment/notify`

When 回调验证通过且订单状态为已支付

Then 系统执行：
1. 调用 `handlePaymentCallback` 激活会员
2. 调用 `ensureInstanceForUser` 确保用户有实例（无则创建）
3. 调用 `startInstance` 启动实例
4. 返回成功响应（前端跳转到 `/workspace`）

### 首页重定向逻辑

Given 用户访问 `GET /`

When 请求到达

Then 系统按以下优先级判断：
1. 未登录 → 重定向到 `/login`
2. 已登录 + 无有效会员（`hasActiveMembership` 返回 false）→ 重定向到 `/membership`
3. 已登录 + 有有效会员 + 无 running 实例 → 重定向到 `/workspace`（页面内自动启动）
4. 已登录 + 有有效会员 + 有 running 实例 → 重定向到 `/workspace`

### 会员过期处理

Given 已登录用户访问系统

When 会员已过期（`hasActiveMembership` 返回 false）

Then：
- 访问 `/workspace` → 重定向到 `/membership`
- 访问 `/` → 重定向到 `/membership`
- 访问 `/instances` → 允许访问（用户可能需要管理实例）
- 访问 `/profile` → 允许访问（用户可能需要续费）

## 导航栏增强

### 用户下拉菜单

Given 已登录用户在任意 DSH Hub 页面

When 点击顶栏右侧用户头像/昵称

Then 下拉菜单显示以下选项：
1. **个人信息** → 跳转 `/profile`
2. **实例管理** → 跳转 `/instances`
3. **退出系统** → 调用 logout

### Workspace 页面顶栏

Given 用户在 `/workspace` 页面

When 页面加载

Then 顶栏显示：
- 左侧：DSH Hub logo + 品牌名
- 右侧：用户头像/昵称下拉菜单（同上：个人信息、实例管理、退出系统）
- 顶栏下方：DSH 实例内容（占满剩余视口高度）
