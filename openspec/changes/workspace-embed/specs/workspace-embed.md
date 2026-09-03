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

## 向后兼容

- 现有 `/i/<slug>-<id>` 网关代理不受影响
- 用户仍可通过 `/i/<slug>-<id>` 直接访问实例（独立全屏模式）
- `/workspace` 是新的访问入口，不替代现有路径
