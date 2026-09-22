# 验收规范：登录/认证与 Workspace 体验修复

## 工作流 1：Workspace 启动超时兜底

### 场景 1.1：实例正常就绪
**Given** 用户有会员但实例处于 stopped
**When** 打开 `/workspace`
**Then** 显示 loading；后台只发一次 `POST /api/instances/:id/start`
**And** 实例变为 running 后自动进入 Workspace（注入 hub 顶部栏）

### 场景 1.2：60 秒内未就绪 → 兜底
**Given** 实例始终无法 running
**When** loading 超过 `WORKSPACE_START_TIMEOUT_MS`(60s)
**Then** 停止轮询，进入"启动超时"态
**And** 页面展示 **hub 顶部栏**
**And** 提供 重试 / 进入实例管理(`/instances`) / 返回首页 入口
**And** 不再无限转圈

### 场景 1.3：不重复启动
**Given** loading 中
**When** 轮询多次
**Then** `POST .../start` 只发生一次，之后只 `GET /api/instances`

### 场景 1.4：落点不回环
**Given** 用户点击"返回"入口
**Then** 落在带 hub 导航的页面（`/instances`），**不会**因 `GET /` 重定向 `/workspace` 而回环

## 工作流 2：用户名/密码规则与提示一致

### 场景 2.1：用户名规则
**Given** 注册/建用户
**When** 输入用户名
**Then** 仅接受 `[a-zA-Z0-9]` 且长度 6–32
**And** 含下划线/非字母数字/<6/>32 → 被拒绝
**And** 页面提示为"6-32 位英文字母或数字"（与后端错误文案一致）

### 场景 2.2：密码规则
**Given** 注册/改密/重置/建用户
**When** 输入密码
**Then** 长度不足或**不同时含字母与数字** → 被拒绝
**And** 页面提示为"至少 8 位，且同时包含字母和数字"（`PASSWORD_MIN_LEN = 8`）
**And** 合法密码（满足长度+字母+数字）可提交成功

### 场景 2.3：前后端一致
**Given** 绕过前端直接 `POST /api/auth/register`
**When** 提交违规用户名/密码
**Then** 后端返回 400 且错误文案与前端一致

### 场景 2.4：历史兼容
**Given** 历史用户名为含下划线或 <6 位
**When** 该用户登录
**Then** 仍可正常登录（新规则不回溯既有账号）

## 工作流 3：认证页移动端兼容

### 场景 3.1：移动端可调起输入法
**Given** 鸿蒙/微信/百度APP 等机型打开 `/login`、`/register`
**When** 点按用户名/密码输入框
**Then** 系统输入法正常弹出
**And** 键盘弹起时输入框不被遮挡（可滚动到可视区）

### 场景 3.2：通用原生组件
**Given** 检查认证页表单
**Then** 输入框为原生 `<input>`，带 `type/name/autocomplete/inputmode/pattern/minlength`
**And** 不再引用未定义 CSS 变量（`--radius-pill`）

### 场景 3.3：桌面端不回归
**Given** 桌面浏览器打开认证页
**Then** 布局正常（空间足够时垂直居中，移动端可滚动）

## 认证时效（已确认：不调整）
- 会话：滑动 7 天 / 绝对 30 天；每用户 ≤20 会话
- API token：无过期，仅手动吊销
- **维持现状**；后续如需调整，另立变更修改 `SESSION_TTL_MS` / `SESSION_ABSOLUTE_TTL_MS`（及可选的 token 过期）。
