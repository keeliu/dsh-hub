# Proposal: Web UI MVP（服务端渲染）

## Why

当前 DSH Hub 是纯后端 API 服务，没有任何前端页面。管理员无法通过网页登录，用户无法注册/登录。需要实现基础的 Web UI 让系统可用。

**核心问题**：
- 管理员无法登录管理后台
- 用户无法注册/登录
- 没有可视化的管理界面

## What Changes

### 新增页面

**公共页面**：
- `/setup` — 首启向导（无用户时创建管理员）
- `/login` — 登录页（用户/管理员共用）
- `/register` — 注册页（注册开关开放时可用）

**用户端页面**（登录后）：
- `/` — 我的实例列表（用户首页）
- `/instances/:id` — 实例详情（状态、日志、操作）

**管理员端页面**（admin/root 登录后）：
- `/admin` — 管理后台首页（仪表盘）
- `/admin/users` — 用户管理
- `/admin/instances` — 实例总览
- `/admin/audit` — 审计日志
- `/admin/settings` — 全局设置

### 技术方案

采用**服务端渲染（SSR）**：
- Node.js 直接返回 HTML + 内联 CSS/JS
- 零新增依赖，符合项目"运行时零依赖"原则
- 无需构建步骤，改完即生效
- 模板字符串渲染，简单直接

### 不做什么

- 不做复杂的前端框架集成（React/Vue 等）
- 不做 SPA 路由（整页跳转）
- 不做复杂的表单验证（服务端校验为主）
- 不做响应式设计（先保证功能可用）

## Impact

### 新增文件
- `dsh-hub/src/views/` — HTML 模板目录
  - `layout.ts` — 公共布局（header/footer/CSS）
  - `auth.ts` — 登录/注册/首启向导页面
  - `user.ts` — 用户端页面（实例列表/详情）
  - `admin.ts` — 管理后台页面
- `dsh-hub/src/pages.ts` — 页面路由（HTML 响应）

### 修改文件
- `dsh-hub/src/api.ts` — 集成页面路由，添加 HTML 响应支持
- `dsh-hub/src/http.ts` — 添加 `sendHtml()` 辅助函数

### 对现有 API 的影响
- 无破坏性变更
- 现有 API 路由保持不变
- 新增页面路由与 API 路由共存

### 用户体验变化
- 管理员可通过浏览器登录并管理
- 用户可通过浏览器注册/登录并管理实例
- 登录后可通过网关访问 DSH 实例
