# Proposal: 移动端适配 + 认证增强

## Why

当前 Web UI 仅针对桌面端设计，移动端体验差。同时认证体系需要增强：
1. 注册缺少邮箱字段，无法用于找回密码
2. 没有找回密码功能，用户忘记密码后无法自助恢复
3. 移动端用户占比高，需要响应式设计

## What Changes

### 1. 移动端响应式适配
- 所有页面支持移动端布局
- 导航栏适配小屏幕（汉堡菜单或底部 Tab）
- 表单、表格、按钮适配触摸操作
- 管理后台侧边栏折叠为抽屉

### 2. 注册增强
- 新增 `email` 字段（必填，唯一）
- 新增 `username` 字段（登录账户名，必填，唯一）
- 注册时验证邮箱格式
- 数据库 users 表新增 email、username 列

### 3. 登录增强
- 支持 `username` + 密码登录（替代 nickname）
- 登录页显示"账户/邮箱"输入框

### 4. 找回密码
- 新增 `/forgot-password` 页面
- 输入邮箱 → 发送 6 位验证码到邮箱
- 验证码有效期 10 分钟
- 输入验证码 + 新密码 → 重置密码
- 需要邮件发送服务（SMTP 或第三方）

### 5. 退出登录跳转
- 普通用户退出后跳转到 `/login`
- 管理员退出后跳转到 `/login`
- 确保会话完全失效

## Impact

### 数据库变更
- `users` 表新增 `email`、`username` 列
- 新增 `password_reset_codes` 表（存储验证码）

### API 变更
- `POST /api/auth/register` 增加 email、username 参数
- `POST /api/auth/login` 支持 username 登录
- 新增 `POST /api/auth/forgot-password`（发送验证码）
- 新增 `POST /api/auth/reset-password`（重置密码）

### 前端变更
- 所有页面 CSS 增加响应式断点
- 注册页增加邮箱、账户字段
- 登录页改为账户/邮箱输入
- 新增找回密码页面

### 外部依赖
- 需要配置 SMTP 或邮件发送服务
- 环境变量：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`
