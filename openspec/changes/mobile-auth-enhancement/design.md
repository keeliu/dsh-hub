# Design: 移动端适配 + 认证增强

## 1. 移动端响应式方案

### CSS 断点
```css
/* 移动端优先 */
:root {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
}

/* 移动端布局 */
@media (max-width: 767px) {
  .sidebar { display: none; }
  .mobile-menu { display: block; }
  .content { padding: 12px; }
  .card { width: 100%; }
}
```

### 导航适配
- 桌面端：顶部导航 + 侧边栏
- 移动端：顶部导航 + 汉堡菜单（抽屉式）

### 组件适配
- 按钮：最小高度 44px（触摸友好）
- 输入框：字体 ≥ 16px（防止 iOS 缩放）
- 表格：移动端改为卡片列表

---

## 2. 数据模型变更

### users 表新增列
```sql
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN username TEXT;

-- 迁移现有数据：用 nickname 填充 username
UPDATE users SET username = nickname WHERE username IS NULL;

-- 添加唯一约束（需要先处理空值）
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;
```

### password_reset_codes 表
```sql
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_reset_codes_code ON password_reset_codes(code);
```

---

## 3. API 设计

### 注册增强
```typescript
POST /api/auth/register
Body: {
  nickname: string,      // 显示名称
  username: string,      // 登录账户名（新增）
  email: string,         // 邮箱（新增）
  password: string
}
```

### 登录增强
```typescript
POST /api/auth/login
Body: {
  login: string,         // 账户名或邮箱（替代 nickname）
  password: string
}
```

### 找回密码
```typescript
// 发送验证码
POST /api/auth/forgot-password
Body: { email: string }
Response: { ok: true, message: "验证码已发送" }

// 重置密码
POST /api/auth/reset-password
Body: {
  email: string,
  code: string,          // 6 位验证码
  newPassword: string
}
Response: { ok: true }
```

---

## 4. 邮件发送方案

### 环境变量
```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=***
SMTP_FROM="DSH Hub <noreply@example.com>"
```

### 邮件模块
```typescript
// src/mailer.ts
import { createTransport } from 'nodemailer'; // 或自实现 SMTP

export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<void> {
  // 发送 6 位验证码邮件
}
```

### 验证码生成
```typescript
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
```

---

## 5. 安全考虑

### 验证码
- 6 位数字，有效期 10 分钟
- 每个邮箱同时只能有一个有效验证码
- 验证码使用后标记为已使用
- 发送频率限制：同一邮箱 60 秒内只能发送一次

### 密码重置
- 重置后吊销该用户所有会话和 API token
- 记录审计日志

### 防枚举
- 邮箱未注册时，仍返回"验证码已发送"（但实际不发送）
- 避免攻击者通过错误信息判断邮箱是否存在

---

## 6. 向后兼容

### 现有用户迁移
- `username` 默认用 `nickname` 填充
- `email` 允许为空（现有用户可后续补充）
- 登录兼容：同时支持 nickname、username、email

### API 兼容
- `/api/auth/login` 的 `login` 字段同时匹配 username 和 email
- 旧的 `nickname` 登录方式保留（向后兼容）
