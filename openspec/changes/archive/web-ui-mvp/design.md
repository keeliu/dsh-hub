# Design: Web UI MVP 技术方案

## 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    DSH Hub 控制面                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                  HTTP 路由层                      │   │
│  │  ┌─────────────┐  ┌─────────────┐               │   │
│  │  │  页面路由    │  │  API 路由   │               │   │
│  │  │  (HTML)     │  │  (JSON)     │               │   │
│  │  └──────┬──────┘  └──────┬──────┘               │   │
│  │         │                │                       │   │
│  │         ▼                ▼                       │   │
│  │  ┌─────────────┐  ┌─────────────┐               │   │
│  │  │  views/     │  │  业务逻辑   │               │   │
│  │  │  HTML 模板  │  │  (现有)     │               │   │
│  │  └─────────────┘  └─────────────┘               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 目录结构

```
dsh-hub/src/
├── views/                    # 新增：HTML 模板
│   ├── layout.ts            # 公共布局（header/footer/CSS）
│   ├── auth.ts              # 登录/注册/首启向导页面
│   ├── user.ts              # 用户端页面
│   └── admin.ts             # 管理后台页面
├── pages.ts                  # 新增：页面路由
├── api.ts                    # 修改：集成页面路由
├── http.ts                   # 修改：添加 sendHtml()
└── ...                       # 现有模块不变
```

## 技术方案细节

### 1. HTML 模板渲染

使用 TypeScript 模板字符串生成 HTML：

```typescript
// views/layout.ts
export function layout(title: string, content: string, user?: UserRow): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)} - DSH Hub</title>
  <style>${CSS}</style>
</head>
<body>
  <nav>${renderNav(user)}</nav>
  <main>${content}</main>
</body>
</html>`;
}
```

### 2. 页面路由

新增 `pages.ts` 处理 HTML 请求：

```typescript
// pages.ts
export function registerPageRoutes(): void {
  // 公共页面
  page('GET', '/setup', handleSetup);
  page('GET', '/login', handleLogin);
  page('GET', '/register', handleRegister);
  
  // 用户页面（需登录）
  page('GET', '/', authRequired, handleInstances);
  page('GET', '/instances/:id', authRequired, handleInstanceDetail);
  
  // 管理页面（需管理员）
  page('GET', '/admin', adminRequired, handleAdminDashboard);
  page('GET', '/admin/users', adminRequired, handleAdminUsers);
  // ...
}
```

### 3. 表单处理

表单提交复用现有 API，页面路由负责：
- 渲染表单 HTML
- 接收 POST 请求
- 调用 API 逻辑
- 重定向或重新渲染

```typescript
// POST /login 处理
async function handleLoginPost(ctx: PageCtx): Promise<void> {
  const { nickname, password } = await readJson(ctx.req);
  // 调用现有登录逻辑
  const result = await doLogin(ctx.db, nickname, password);
  if (result.success) {
    // 设置 cookie 并重定向
    setSessionCookie(ctx.res, result.token, result.csrf);
    redirect(ctx.res, result.isAdmin ? '/admin' : '/');
  } else {
    // 重新渲染登录页并显示错误
    renderLogin(ctx.res, { error: result.error });
  }
}
```

### 4. CSS 样式

内联 CSS，简洁实用：

```css
:root {
  --primary: #3964FE;  /* DSH 品牌蓝 */
  --danger: #dc3545;
  --success: #28a745;
}

body { font-family: system-ui, sans-serif; margin: 0; }
nav { background: var(--primary); color: white; padding: 1rem; }
.container { max-width: 1200px; margin: 0 auto; padding: 1rem; }
.btn { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; }
.btn-primary { background: var(--primary); color: white; }
.btn-danger { background: var(--danger); color: white; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #eee; }
```

### 5. 交互增强（可选）

基础 JS 增强，不依赖框架：

```javascript
// 确认删除
document.querySelectorAll('[data-confirm]').forEach(el => {
  el.addEventListener('click', e => {
    if (!confirm(el.dataset.confirm)) e.preventDefault();
  });
});

// 自动刷新状态
setInterval(() => {
  document.querySelectorAll('[data-status]').forEach(el => {
    fetch(`/api/instances/${el.dataset.id}`)
      .then(r => r.json())
      .then(data => el.textContent = data.instance.status);
  });
}, 5000);
```

## 鉴权流程

```
用户请求 → 页面路由 → 检查 session
                    ↓
              ┌─────┴─────┐
              │           │
           已登录      未登录
              │           │
              ▼           ▼
         渲染页面    重定向 /login
```

管理员页面额外检查角色：
```
admin 路由 → 检查 role ∈ {admin, root}
                    ↓
              ┌─────┴─────┐
              │           │
           是管理员    非管理员
              │           │
              ▼           ▼
         渲染页面    返回 403
```

## 关键决策

1. **为什么不用模板引擎？**
   - 零依赖原则
   - 模板字符串足够简单
   - 避免引入额外学习成本

2. **为什么不做 SPA？**
   - 快速上线优先
   - 页面跳转简单直接
   - 后续可渐进增强

3. **为什么表单 POST 不走 API？**
   - 减少前后端交互复杂度
   - 表单提交更自然（支持浏览器后退）
   - API 仍可独立使用（脚本调用）

4. **CSS 为什么内联？**
   - 零依赖，无需构建
   - 单文件部署简单
   - 后续可提取为独立文件

## 风险与缓解

| 风险 | 缓解措施 |
|---|---|
| HTML 注入 | 所有用户输入 escapeHtml |
| XSS | CSP 头 + 不渲染原始 HTML |
| 样式混乱 | 统一 CSS 变量 + 命名空间 |
| 维护困难 | 模板函数化，避免大段字符串 |
