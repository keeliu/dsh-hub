# Spec: 页面表单 CSRF 保护

## Feature: CSRF Token 嵌入

### Scenario: 已登录用户的页面包含 CSRF token
- GIVEN 用户已登录，持有 CSRF cookie `dshhub_csrf`
- WHEN 渲染任何包含 POST 表单的页面
- THEN 每个 `<form method="POST">` 内包含 `<input type="hidden" name="_csrf" value="...">`
- AND 值与 CSRF cookie 中的 token 一致

### Scenario: 未登录页面不包含 CSRF token
- GIVEN 用户未登录（如 /login、/register 页面）
- WHEN 渲染页面
- THEN 表单不包含 `_csrf` 隐藏字段（未登录用户无 CSRF cookie）

## Feature: CSRF 校验

### Scenario: POST 表单携带有效 CSRF token
- GIVEN 已登录用户提交 POST 表单
- AND 表单包含 `_csrf` 字段
- AND `_csrf` 值与 cookie 中的 CSRF token 匹配
- WHEN 页面路由处理 POST 请求
- THEN 校验通过，正常执行业务逻辑

### Scenario: POST 表单缺少 CSRF token
- GIVEN 已登录用户提交 POST 表单
- AND 表单缺少 `_csrf` 字段
- WHEN 页面路由处理 POST 请求
- THEN 返回 403 错误页面

### Scenario: POST 表单 CSRF token 不匹配
- GIVEN 已登录用户提交 POST 表单
- AND `_csrf` 值与 cookie 中的 CSRF token 不一致
- WHEN 页面路由处理 POST 请求
- THEN 返回 403 错误页面

## Feature: 受保护的页面路由

### Scenario: 实例操作表单受 CSRF 保护
- GIVEN 用户访问实例列表页
- WHEN 页面渲染
- THEN 启动/停止/重启/删除表单均包含 `_csrf` 隐藏字段

### Scenario: 管理后台表单受 CSRF 保护
- GIVEN 管理员访问管理后台
- WHEN 页面渲染
- THEN 用户管理/设置保存等表单均包含 `_csrf` 隐藏字段
