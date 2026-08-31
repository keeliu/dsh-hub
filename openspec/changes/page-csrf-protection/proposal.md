# Proposal: 页面表单 CSRF 保护

## Why

当前 API 路由的写操作（POST/PATCH/DELETE）通过 `assertCsrf` 强制校验双重提交 CSRF token，但页面路由（`pages.ts`）的表单 POST 完全没有 CSRF 校验。

虽然 session cookie 设置了 `SameSite=Lax`（提供了一定保护），但：
- `SameSite=Lax` 仅对顶级导航的 GET 请求放行 cookie，POST 跨站请求会被拦截——这在大多数场景下有效。
- 但 `SameSite=Lax` 不覆盖所有 CSRF 场景（如 `<form method="POST">` 在某些旧浏览器中可能被放行）。
- API 层和页面层的 CSRF 策略不一致，违反纵深防御原则。

## What Changes

### 1. 页面表单嵌入 CSRF token

所有已登录用户可见的 POST 表单必须在 `<form>` 内嵌入隐藏字段：

```html
<input type="hidden" name="_csrf" value="${csrfToken}">
```

### 2. 页面路由统一 CSRF 校验

`pages.ts` 的 `handlePageRequest` 在分发 POST 请求前，对已鉴权用户校验 `_csrf` 字段。

### 3. CSRF token 传递到视图

页面渲染函数（`layout`、`authLayout`）接收 CSRF token 参数，注入到全局可用。

## Impact

- **破坏性**：无。仅影响已登录用户的页面表单提交。
- **影响范围**：`src/pages.ts`、`src/views/layout.ts`、所有 POST 表单模板
- **风险**：低。CSRF token 已在 cookie 中，只需从 cookie 读取并嵌入表单。
