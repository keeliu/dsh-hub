# Spec: 表单内容保留 + 退出登录跳转优化

## Feature: 注册表单内容保留

### Scenario: 注册时用户名已存在
- **Given** 用户在注册页面填写了昵称 "张三"、用户名 "zhangsan"、邮箱 "zhangsan@example.com"
- **When** 提交注册，但用户名 "zhangsan" 已被占用
- **Then** 页面显示错误提示"用户名已被占用"
- **And** 昵称字段保留 "张三"
- **And** 用户名字段保留 "zhangsan"
- **And** 邮箱字段保留 "zhangsan@example.com"
- **And** 密码字段为空（安全考虑不回显）

### Scenario: 注册时邮箱格式错误
- **Given** 用户在注册页面填写了邮箱 "invalid-email"
- **When** 提交注册
- **Then** 页面显示错误提示"邮箱格式不正确"
- **And** 昵称、用户名、邮箱字段保留用户输入的值
- **And** 密码字段为空

### Scenario: 注册时密码长度不足
- **Given** 用户在注册页面填写了密码 "123"（少于 8 位）
- **When** 提交注册
- **Then** 页面显示错误提示"密码至少 8 个字符"
- **And** 昵称、用户名、邮箱字段保留用户输入的值
- **And** 密码字段为空

### Scenario: 注册时两次密码不一致
- **Given** 用户在注册页面填写了密码 "password123" 和确认密码 "password456"
- **When** 提交注册
- **Then** 页面显示错误提示"两次密码不一致"
- **And** 昵称、用户名、邮箱字段保留用户输入的值
- **And** 密码字段为空

### Scenario: 注册成功
- **Given** 用户填写了所有必填字段且符合规则
- **When** 提交注册
- **Then** 注册成功
- **And** 跳转到登录页面
- **And** 表单数据不保留（正常流程）

## Feature: 退出登录统一跳转

### Scenario: 普通用户退出登录
- **Given** 普通用户已登录
- **When** 点击退出登录
- **Then** 会话失效
- **And** 跳转到 `/login` 页面

### Scenario: 管理员退出登录
- **Given** 管理员（admin/root）已登录
- **When** 点击退出登录
- **Then** 会话失效
- **And** 跳转到 `/login` 页面

### Scenario: 退出后访问受保护页面
- **Given** 用户已退出登录
- **When** 尝试访问 `/` 或 `/admin`
- **Then** 重定向到 `/login` 页面
