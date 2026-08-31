# Tasks: 移动端适配 + 认证增强

## Phase 1: 数据模型与后端

- [ ] 1.1 数据库迁移：users 表新增 email、username 列
- [ ] 1.2 创建 password_reset_codes 表
- [ ] 1.3 更新 users.ts：注册时保存 email、username
- [ ] 1.4 更新 auth.ts：登录支持 username/email
- [ ] 1.5 实现邮件发送模块 src/mailer.ts
- [ ] 1.6 实现发送验证码 API：POST /api/auth/forgot-password
- [ ] 1.7 实现重置密码 API：POST /api/auth/reset-password
- [ ] 1.8 更新 API 路由注册

## Phase 2: 移动端响应式

- [ ] 2.1 更新 views/layout.ts：添加响应式 CSS
- [ ] 2.2 导航栏移动端适配（汉堡菜单）
- [ ] 2.3 表单组件移动端适配
- [ ] 2.4 表格/列表移动端适配

## Phase 3: 前端页面更新

- [ ] 3.1 更新 views/auth.ts：注册页增加邮箱、账户字段
- [ ] 3.2 更新 views/auth.ts：登录页改为账户/邮箱输入
- [ ] 3.3 新增找回密码页面 /forgot-password
- [ ] 3.4 新增重置密码页面 /reset-password
- [ ] 3.5 更新退出登录逻辑：退出后跳转到 /login

## Phase 4: 测试与验证

- [ ] 4.1 TypeScript 类型检查
- [ ] 4.2 本地功能测试
- [ ] 4.3 移动端预览测试
- [ ] 4.4 归档 OpenSpec 变更

## 依赖

- 需要配置 SMTP 环境变量（SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS）
- 或使用第三方邮件服务 API
