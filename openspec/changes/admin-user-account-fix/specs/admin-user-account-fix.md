# 功能规范：管理后台用户账号字段显示 + 管理员登录修复

## Feature: 用户管理列表显示账号字段

### Scenario: 管理员查看用户列表
- **Given** 管理员已登录管理后台
- **When** 访问用户管理页面 `/admin/users`
- **Then** 用户列表显示以下字段：
  - 昵称（nickname）
  - 账号（username）
  - 邮箱（email）
  - 角色（role）
  - 状态（status）
  - 操作（actions）

### Scenario: 用户列表按账号排序
- **Given** 管理员在用户管理页面
- **When** 点击"账号"列头
- **Then** 用户列表按账号字母顺序排序

---

## Feature: 管理员登录后进入管理后台

### Scenario: 管理员登录成功跳转
- **Given** 用户在登录页面
- **When** 使用管理员账号（role=admin 或 role=root）登录成功
- **Then** 自动跳转到管理后台首页 `/admin`

### Scenario: 普通用户登录成功跳转
- **Given** 用户在登录页面
- **When** 使用普通用户账号（role=user）登录成功
- **Then** 自动跳转到实例列表页面 `/`

### Scenario: 带 redirect 参数的登录
- **Given** 用户访问需要登录的页面，被重定向到 `/login?redirect=/admin`
- **When** 登录成功
- **Then** 跳转到 redirect 参数指定的页面（需校验权限）

---

## Feature: 管理后台入口

### Scenario: 导航栏显示管理后台入口
- **Given** 管理员已登录
- **When** 查看页面导航栏
- **Then** 显示"管理后台"链接，点击可进入 `/admin`

### Scenario: 普通用户不显示管理后台入口
- **Given** 普通用户已登录
- **When** 查看页面导航栏
- **Then** 不显示"管理后台"链接
