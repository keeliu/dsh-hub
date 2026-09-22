# Design: 页面表单 CSRF 保护

## 方案选择

**方案 A（选定）**：从 CSRF cookie 读取 token，嵌入表单隐藏字段，POST 时校验 `_csrf` 表单字段与 cookie 值一致（timingSafeEqual）。

**方案 B（放弃）**：服务端生成 CSRF token 存 session，渲染时注入。增加 session 存储开销，且当前已有 CSRF cookie 机制，无需重复。

## 实现细节

### 1. 布局层注入

`views/layout.ts` 的 `layout()` 函数增加 `csrf` 参数，在 HTML 头部注入 meta 标签：

```html
<meta name="csrf-token" content="${csrf}">
```

同时提供辅助函数 `csrfField(csrf)` 生成隐藏字段 HTML：

```typescript
export function csrfField(csrf: string): string {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">`;
}
```

### 2. 页面路由校验

`pages.ts` 的 `handlePageRequest` 在 POST 请求分发前校验：

```typescript
if (method === 'POST' && auth) {
  const cookies = parseCookies(req);
  const expected = cookies[CSRF_COOKIE];
  const form = await peekForm(req); // 预读表单（不消费 body）
  const got = form._csrf;
  if (!expected || !got || !timingSafeEqual(expected, got)) {
    sendHtml(res, 403, renderErrorPage('CSRF 校验失败'));
    return true;
  }
}
```

**注意**：需要在不消费 request body 的前提下读取 `_csrf` 字段。两种实现方式：
- 方式一：POST handler 内部自行校验（每个 handler 加一行校验代码）。
- 方式二（选定）：在 `readForm` 返回结果后、业务逻辑前统一校验。将校验逻辑提取为 `assertPageCsrf(req, form)` 函数，每个 POST handler 在 `readForm` 后调用。

### 3. 受保护的表单清单

| 页面路由 | 表单 |
|---|---|
| POST /setup | 首启向导 |
| POST /register | 注册 |
| POST /instances | 创建实例 |
| POST /instances/:id/start | 启动实例 |
| POST /instances/:id/stop | 停止实例 |
| POST /instances/:id/restart | 重启实例 |
| POST /instances/:id/delete | 删除实例 |
| POST /admin/users | 创建用户 |
| POST /admin/users/:id/disable | 封禁用户 |
| POST /admin/users/:id/enable | 启用用户 |
| POST /admin/instances/:id/start | 管理员启动 |
| POST /admin/instances/:id/stop | 管理员停止 |
| POST /admin/instances/:id/delete | 管理员删除 |
| POST /admin/settings | 保存设置 |

**豁免**：POST /login、POST /forgot-password、POST /reset-password（未登录用户无 CSRF cookie）。

## 不变更的部分

- API 路由的 CSRF 校验逻辑不变（已有 `assertCsrf`）。
- Cookie 设置不变（`SameSite=Lax` 保留作为额外防线）。
