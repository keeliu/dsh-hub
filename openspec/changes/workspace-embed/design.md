# Workspace 直接嵌入技术方案

## 架构

```
浏览器
  │
  ├─ GET /workspace              → 入口：返回重写后的 index.html
  ├─ GET /workspace/assets/*     → 静态资源代理（重写 CSS 中的 url()）
  ├─ GET /workspace/plugins/*    → 插件资源代理
  ├─ POST /workspace/api/*       → API 代理（不重写响应体）
  ├─ GET /workspace/chat         → SPA fallback：返回 index.html
  ─ WS  /workspace/ws           → WebSocket 代理
```

## 模块设计

### gateway.ts 新增

```typescript
// Workspace 代理配置
const WORKSPACE_PREFIX = '/workspace';

// 需要重写路径的 Content-Type
const REWRITE_CONTENT_TYPES = ['text/html', 'text/css'];

// HTML 中需要重写路径的标签属性
const HTML_PATH_ATTRS = [
  { tag: 'script', attr: 'src' },
  { tag: 'link', attr: 'href' },
  { tag: 'img', attr: 'src' },
  { tag: 'video', attr: 'src' },
  { tag: 'source', attr: 'src' },
];

// 重写 HTML 响应体中的绝对路径
function rewriteHtmlPaths(html: string, prefix: string): string {
  // 重写 <script src="/assets/..."> → <script src="/workspace/assets/...">
  // 重写 <link href="/assets/..."> → <link href="/workspace/assets/...">
  // 不重写外部 URL、相对路径、data URI
}

// 重写 CSS 响应体中的 url() 路径
function rewriteCssPaths(css: string, prefix: string): string {
  // url(/assets/font.woff) → url(/workspace/assets/font.woff)
  // 不重写 url(https://...)、url(data:...)、url(./...)
}

// 注入 __DSH_DEPLOYMENT__ 配置
function injectDeploymentConfig(html: string, prefix: string): string {
  // 在 <head> 中插入 <script>window.__DSH_DEPLOYMENT__ = {...}</script>
}

// Workspace 入口处理
function handleWorkspaceEntry(db, req, res): boolean {
  // 1. 认证检查
  // 2. 查找 running 实例
  // 3. 获取 index.html
  // 4. 重写 + 注入配置
  // 5. 返回
}

// Workspace 通配代理
function handleWorkspaceProxy(db, req, res, pathname): boolean {
  // 1. 去掉 /workspace 前缀
  // 2. 代理到实例
  // 3. 根据 Content-Type 决定是否重写响应体
}
```

### pages.ts 新增

```typescript
// GET /workspace → handleWorkspaceEntry
// GET /workspace/* → handleWorkspaceProxy（SPA fallback 包含在内）
```

### api.ts 扩展

```typescript
// 现有 DSH API fallback 扩展：
// 原来只处理 /api/* → 现在也处理 /workspace/api/*
```

## 关键决策

### 1. 响应体重写 vs URL 映射

**决策**：使用响应体重写（修改 HTML/CSS 内容），而不是 URL 映射（修改请求路径）。

**理由**：
- DSH 实例返回的 HTML 中包含绝对路径（`/assets/main.js`），浏览器会直接请求这些路径
- 如果只映射请求路径而不重写 HTML，浏览器仍然会请求 `/assets/main.js`（不带 `/workspace` 前缀），命中 DSH Hub 的路由而非实例
- 响应体重写确保浏览器发出的所有请求都带 `/workspace` 前缀

**风险**：正则重写可能漏掉某些路径格式。缓解：只重写标准标签属性，不重写 JS 字符串中的 URL（依赖 `__DSH_DEPLOYMENT__` 配置）。

### 2. __DSH_DEPLOYMENT__ 注入

**决策**：在 HTML 中注入 `__DSH_DEPLOYMENT__` 配置，设置 `apiBase: '/workspace'`。

**理由**：
- DSH 前端使用 `window.__DSH_DEPLOYMENT__?.apiBase` 拼接 API 请求 URL
- 注入配置后，所有 API 请求自动变为 `/workspace/api/...`，无需重写 JS 文件
- 这是 DSH 官方支持的部署配置方式

### 3. SPA fallback 实现

**决策**：在 `handleWorkspaceProxy` 中，如果请求路径不是实例上的真实文件，返回重写后的 `index.html`。

**理由**：
- DSH 是 SPA，客户端路由（如 `/chat`、`/settings`）在实例上没有对应文件
- 返回 `index.html` 让前端 JS 接管路由
- 与 `gateway-spa-fallback` 提案的逻辑一致，只是路径前缀不同

### 4. WebSocket 代理

**决策**：复用现有的 WebSocket 代理逻辑，支持 `/workspace/ws` 前缀。

**理由**：
- WebSocket 代理已经有完整实现（`proxy.ts`）
- 只需在路径解析时去掉 `/workspace` 前缀
- 鉴权逻辑不变（session cookie 自动带上）

## 实现顺序

1. **Phase 1**：基础代理（`/workspace` 入口 + `/workspace/*` 通配代理 + HTML 重写）
2. **Phase 2**：API 代理 + `__DSH_DEPLOYMENT__` 注入 + SPA fallback
3. **Phase 3**：WebSocket 代理 + CSS 重写 + 自动启动逻辑
4. **Phase 4**：测试验证（类型检查 + 冒烟测试 + 手动验证）

## 文件改动清单

| 文件 | 改动 | 行数变化 |
|---|---|---|
| `src/gateway.ts` | 新增 workspace 代理函数 + 响应体重写函数 | +150 |
| `src/pages.ts` | 新增 `/workspace` 和 `/workspace/*` 路由 | +20 |
| `src/api.ts` | 扩展 DSH API fallback 支持 `/workspace/api/*` | +10 |
| `src/views/workspace.ts` | 新增 Workspace 页面渲染（loading 状态 + 自动启动） | +80 |

总计约 +260 行代码。
