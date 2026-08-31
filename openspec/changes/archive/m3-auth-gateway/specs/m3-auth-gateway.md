# M3: 鉴权网关规范

## Feature: 子域路由

### Scenario: 正常子域名路由
- **Given** 用户已登录，拥有实例 `i-abc123`，slug 为 `alice`
- **When** 访问 `alice-i-abc123.hub.wuyajun.cn`
- **Then** 网关解析出 `slug=alice`、`instanceId=i-abc123`
- **And** 验证实例属主为当前用户
- **And** 反向代理到 `127.0.0.1:<实例端口>`

### Scenario: 子域名格式错误
- **Given** 访问的子域名不符合 `<slug>-<id>.domain` 格式
- **When** 网关解析子域名
- **Then** 返回 400 Bad Request

### Scenario: 实例不存在
- **Given** 子域名中的 instanceId 不存在
- **When** 网关查询实例
- **Then** 返回 404 Not Found

### Scenario: 实例属主不匹配
- **Given** 用户 A 访问用户 B 的实例子域名
- **When** 网关校验所有权
- **Then** 返回 403 Forbidden

## Feature: 鉴权校验

### Scenario: Session Cookie 鉴权
- **Given** 用户已登录，持有有效 session cookie
- **When** 访问实例子域名
- **Then** 网关验证 session 有效
- **And** 允许访问

### Scenario: Bearer Token 鉴权
- **Given** 用户持有有效 API token
- **When** 请求头包含 `Authorization: Bearer <token>`
- **Then** 网关验证 token 有效
- **And** 允许访问

### Scenario: 未登录访问
- **Given** 用户未登录，无有效凭证
- **When** 访问实例子域名
- **Then** 重定向到 `/login?redirect=<原始URL>`

### Scenario: 管理员访问任意实例
- **Given** 用户角色为 admin 或 root
- **When** 访问任意实例子域名
- **Then** 允许访问（无需所有权校验）

## Feature: WebSocket 隧道

### Scenario: WebSocket 连接建立
- **Given** 用户已登录，访问实例的 WebSocket 路径
- **When** 发起 WebSocket 升级请求
- **And** 路径为 `/api/events.mux|host` 或 `/api/events.mux`
- **Then** 网关建立到实例 WebSocket 端口的隧道
- **And** 双向转发数据

### Scenario: WebSocket 鉴权失败
- **Given** 用户未登录或无权限
- **When** 发起 WebSocket 升级请求
- **Then** 拒绝连接，返回 401/403

### Scenario: WebSocket 实例未运行
- **Given** 目标实例状态为 stopped
- **When** 发起 WebSocket 连接
- **Then** 返回错误信息，提示实例未运行

## Feature: 实例引导页

### Scenario: 实例已停止
- **Given** 用户访问自己的实例子域名
- **When** 实例状态为 stopped
- **Then** 返回 HTML 引导页
- **And** 展示"实例已停止"状态
- **And** 提供"启动实例"按钮

### Scenario: 用户点击启动
- **Given** 用户在引导页
- **When** 点击"启动实例"按钮
- **Then** 调用 API 启动实例
- **And** 页面自动刷新或轮询状态
- **And** 实例运行后跳转到 dsh UI

### Scenario: 实例启动中
- **Given** 实例状态为 starting
- **When** 用户访问实例子域名
- **Then** 返回引导页，展示"启动中"状态
- **And** 页面自动轮询实例状态

## Feature: 自动实例创建

### Scenario: 用户注册后自动创建实例
- **Given** 新用户完成注册
- **When** 注册 API 返回成功
- **Then** 系统自动创建实例（使用用户 slug + 随机 ID）
- **And** 自动启动实例
- **And** 返回实例访问地址

### Scenario: 自动实例命名
- **Given** 用户 slug 为 `alice`
- **When** 系统自动创建实例
- **Then** 实例 ID 为 `i-<8位随机hex>`
- **And** 实例名称为 `Alice 的实例`

### Scenario: 自动实例失败
- **Given** 用户注册成功
- **When** 自动创建实例失败（如端口耗尽）
- **Then** 注册仍然成功
- **And** 返回提示信息，引导用户手动创建

## Feature: 域名配置

### Scenario: 自定义域名
- **Given** 环境变量 `DSH_HUB_DOMAIN=hub.wuyajun.cn`
- **When** 网关解析子域名
- **Then** 使用配置的域名进行匹配

### Scenario: 默认域名
- **Given** 未设置 `DSH_HUB_DOMAIN`
- **When** 网关解析子域名
- **Then** 使用默认值 `dshhub.local`
