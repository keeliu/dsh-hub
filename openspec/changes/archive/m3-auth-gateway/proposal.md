# M3: 鉴权网关（正式方案）

## Why

当前 DSH Hub 已完成认证体系和实例生命周期管理（M0-M2.1），但用户访问 dsh web UI 仍需手动配置端口转发，缺乏统一的公网入口。M3 将实现鉴权网关，提供：

1. **子域路由**：用户通过 `<slug>-<id>.hub.wuyajun.cn` 直接访问实例
2. **鉴权校验**：网关层校验 session/token + 实例所有权
3. **WebSocket 隧道**：支持 dsh 事件流的反向代理
4. **引导页**：实例未运行时展示友好的引导界面
5. **自动实例**：用户注册后自动创建并启动实例，无需手动操作

## What Changes

### 1. 子域路由
- 解析 `<slug>-<id>.hub.wuyajun.cn` 格式的子域名
- 从子域名提取 `slug` 和 `instanceId`
- 路由到对应的实例端口（127.0.0.1:4000+）

### 2. 鉴权网关
- 校验 session cookie 或 Bearer token
- 验证实例所有权（实例属主 = 当前用户）
- 管理员可访问任意实例

### 3. WebSocket 隧道
- 代理 `/api/events.mux|host` 路径的 WebSocket 连接
- 转发到实例的 WebSocket 端口
- 支持双向数据流

### 4. 引导页
- 实例未运行时返回 HTML 引导页
- 展示"实例已停止"状态和启动按钮
- 用户点击后调用 API 启动实例

### 5. 自动实例
- 用户注册成功后自动创建实例
- 自动启动实例
- 用户登录后直接跳转到实例访问地址

### 6. 域名配置
- `DSH_HUB_DOMAIN` 改为 `hub.wuyajun.cn`
- 需要配置泛域名 SSL 证书（*.hub.wuyajun.cn）

## Impact

### 新增模块
- `src/gateway.ts`：鉴权网关核心逻辑
- `src/subdomain.ts`：子域名解析
- `src/proxy.ts`：HTTP/WebSocket 反向代理

### 修改模块
- `src/index.ts`：集成网关路由
- `src/pages.ts`：添加引导页
- `src/api.ts`：注册后自动创建实例

### 配置变更
- `DSH_HUB_DOMAIN` 环境变量改为 `hub.wuyajun.cn`
- 需要 Caddy/Nginx 配置泛域名 SSL

### 用户体验
- 用户注册后自动获得可用实例
- 通过子域名直接访问，无需记忆端口
- 实例停止时有友好提示

## Out of Scope

- 多节点部署（当前单节点）
- 实例水平扩展
- 自定义域名绑定
