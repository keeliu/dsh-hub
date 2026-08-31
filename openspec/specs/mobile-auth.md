# Spec: 移动端适配 + 认证增强

## Feature: 移动端响应式

### Scenario: 移动端访问登录页
- **Given** 用户使用手机浏览器访问 `/login`
- **When** 页面加载完成
- **Then** 表单宽度适配屏幕，按钮可触摸操作
- **And** 无横向滚动条

### Scenario: 移动端访问管理后台
- **Given** 管理员使用手机访问 `/admin`
- **When** 页面加载完成
- **Then** 侧边栏折叠为汉堡菜单或底部 Tab
- **And** 内容区域可正常浏览和操作

### Scenario: 移动端实例列表
- **Given** 用户在移动端访问 `/`
- **When** 查看实例列表
- **Then** 实例卡片纵向排列
- **And** 操作按钮可触摸

---

## Feature: 注册增强

### Scenario: 注册时填写邮箱和账户
- **Given** 用户访问 `/register`
- **When** 填写注册表单
- **Then** 表单包含：昵称、账户名、邮箱、密码、确认密码
- **And** 邮箱格式校验
- **And** 账户名唯一性校验

### Scenario: 邮箱已存在
- **Given** 邮箱 `test@example.com` 已注册
- **When** 新用户使用相同邮箱注册
- **Then** 返回错误 "邮箱已被注册"

### Scenario: 账户名已存在
- **Given** 账户名 `testuser` 已注册
- **When** 新用户使用相同账户名注册
- **Then** 返回错误 "账户名已被占用"

---

## Feature: 登录增强

### Scenario: 使用账户名登录
- **Given** 用户账户名为 `testuser`
- **When** 使用 `testuser` + 密码登录
- **Then** 登录成功

### Scenario: 使用邮箱登录
- **Given** 用户邮箱为 `test@example.com`
- **When** 使用 `test@example.com` + 密码登录
- **Then** 登录成功

### Scenario: 账户名或邮箱不存在
- **Given** 账户名/邮箱不存在
- **When** 尝试登录
- **Then** 返回错误 "账户或密码错误"

---

## Feature: 退出登录

### Scenario: 普通用户退出登录
- **Given** 普通用户已登录
- **When** 点击退出登录
- **Then** 会话失效
- **And** 跳转到 `/login` 登录页

### Scenario: 管理员退出登录
- **Given** 管理员（admin/root）已登录
- **When** 点击退出登录
- **Then** 会话失效
- **And** 跳转到 `/login` 登录页

---

## Feature: 找回密码

### Scenario: 发送验证码
- **Given** 用户邮箱 `test@example.com` 已注册
- **When** 在 `/forgot-password` 输入邮箱并提交
- **Then** 系统生成 6 位验证码
- **And** 发送验证码到邮箱
- **And** 页面提示"验证码已发送"

### Scenario: 邮箱未注册
- **Given** 邮箱 `unknown@example.com` 未注册
- **When** 尝试发送验证码
- **Then** 返回错误 "邮箱未注册"（防止枚举）

### Scenario: 验证码正确
- **Given** 用户收到验证码 `123456`
- **When** 输入验证码 + 新密码提交
- **Then** 密码重置成功
- **And** 验证码失效
- **And** 跳转到登录页

### Scenario: 验证码错误
- **Given** 验证码为 `123456`
- **When** 输入错误验证码 `654321`
- **Then** 返回错误 "验证码错误或已过期"

### Scenario: 验证码过期
- **Given** 验证码已发送超过 10 分钟
- **When** 尝试使用验证码
- **Then** 返回错误 "验证码已过期"

---

## Feature: 数据模型变更

### Scenario: users 表新增字段
- **Given** 数据库迁移完成
- **Then** `users` 表包含 `email` 列（TEXT, UNIQUE, NOT NULL）
- **And** `users` 表包含 `username` 列（TEXT, UNIQUE, NOT NULL）

### Scenario: password_reset_codes 表
- **Given** 数据库迁移完成
- **Then** 存在 `password_reset_codes` 表
- **And** 包含字段：id, user_id, code, created_at, expires_at, used
