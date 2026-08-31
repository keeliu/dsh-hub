# Design: 表单内容保留 + 退出登录跳转优化

## 1. 注册表单内容保留

### 技术方案

**后端（pages.ts）**：
- 注册失败时，将表单数据（nickname、username、email）传递给视图函数
- 视图函数接收这些参数并渲染到页面

**前端（views/auth.ts）**：
- `renderRegisterPage` 函数签名扩展：
  ```typescript
  export function renderRegisterPage(
    error?: string,
    form?: { nickname?: string; username?: string; email?: string }
  ): string
  ```
- 在 input 元素中添加 `value` 属性，使用传入的表单数据

**密码字段**：
- 出于安全考虑，密码字段不回显
- 用户需要重新输入密码

### 数据流

```
用户提交注册表单
    ↓
POST /register (pages.ts)
    ↓
校验失败
    ↓
renderRegisterPage(error, form)
    ↓
HTML 渲染（保留 form 中的值）
```

## 2. 退出登录统一跳转

### 技术方案

**后端（pages.ts）**：
- 退出登录处理函数中，调用 `destroySession` 后会话失效
- 重定向到 `/login` 页面

**前端**：
- 退出登录按钮的 `href` 指向 `/logout`
- 服务端处理后返回 303 重定向到 `/login`

### 数据流

```
用户点击退出登录
    ↓
GET /logout (pages.ts)
    ↓
destroySession(cookie)
    ↓
303 重定向到 /login
    ↓
用户看到登录页面
```

## 3. 安全考虑

### 表单数据保留
- 仅保留非敏感字段（nickname、username、email）
- 密码字段不回显
- 表单数据仅在本次请求中传递，不存储到服务端

### 退出登录
- 确保会话完全失效后再跳转
- 不携带任何敏感信息到 URL

## 4. 兼容性

- 无数据库变更
- 无 API 变更
- 仅影响页面渲染逻辑
