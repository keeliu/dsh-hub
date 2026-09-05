# DSH Hub 系统迭代记录

> 本文档记录 DSH Hub 项目的所有功能迭代和修复，按日期倒序排列。
> 最后更新：2026-09-06

---

## 2026-09-05

### 功能优化
- **实例详情页访问链接统一改为 `/workspace`**
  - 移除 `buildInstanceUrl` 导入
  - 访问实例链接从 `/i/{userSlug}-{instanceId}` 改为 `/workspace`
  - 用户点击后直接进入 Workspace 页面（带导航栏）
  - 不再直接访问 DSH 实例页面

- **会员实例预置插件完整性校验与标记乐观化（openspec/changes/member-instance-template 阶段6）**
  - `DEFAULT_PLUGINS` 的 2 个 `github:` 源改为 npm 包（`dsh-better-sidebar`/`dsh-cost-meter`），规避 pnpm 对 git 依赖 build 脚本的拦截
  - 新增 `templateHasAllPlugins()`：`copyPreinstalledPlugins` 复制前校验模板 `dependencies` 覆盖全部默认插件，缺插件返回 `false` 走运行时真装
  - `installDefaultPlugins`/`spawn.ts` 只在全部插件成功后写 `.plugins-installed`（失败不写、可重试），不再"空模板+完成标记"锁死
  - Dockerfile `template-builder` 去掉 `|| echo WARN`（任一插件失败即构建失败）+ 构建期校验模板完整

### 问题修复
- **添加 GET /logout 路由修复退出登录报错**
  - 导航栏下拉菜单使用 `<a href="/logout">` 是 GET 请求
  - 之前只有 POST /api/auth/logout 路由
  - 新增 GET /logout 路由处理导航栏退出请求
  - 销毁 session 并重定向到 /login

- **退出登录 404：工作区导航「退出系统」改为 POST /api/auth/logout**
  - 网关注入的工作区导航原用 `GET /logout`；生产旧版本未注册该路由导致 404
  - 改为与后台一致的 `<form method="POST" action="/api/auth/logout">`；实测 303→/login 且 session 正确清除
  - `GET /logout` 路由仍保留（浏览器直接访问兜底）

- **Dockerfile 预创建 profiles/web 目录以支持 dsh plugin add**
  - 根据 dsh-plugin-install-fix 规范文档
  - 预创建 `$TEMPLATE_DSH_HOME/profiles/web` 目录
  - 确保 `dsh plugin --profile web add` 不因目录缺失而失败

- **固定 dsh-hub 静态 IP 以解决 OpenResty 代理问题**
  - 加入 1panel-network 网络
  - 固定 IP: 172.18.0.100
  - 每次重建容器自动获得相同 IP
  - OpenResty 可通过固定 IP 可靠代理

### 文档更新
- **完善会员实例预置模板方案**
  - 补充现有代码冲突分析和整合方案
  - 明确 DSH_HOME 目录结构和用户路径独立性
  - 补充 Profile 目录完整性要求
  - 创建会员实例预置模板方案 OpenSpec 规范文档

### UI 优化
- **修复实例管理页面导航栏重复渲染**
- **修复 DSH 实例页面底部内容被截断**
- **优化实例管理页面**
  - 实例列表页：添加创建时间、最近启动时间列
  - 实例详情页：优化布局，访问链接仅在 running 状态显示
  - 改进返回链接（/instances 而不是 /）
  - 日志标题显示「最近 200 行」

---

## 2026-09-04

### 数据持久化
- **数据卷迁移 - 统一数据持久化路径到 `/data/dsh-hub`**
  - docker-compose.yml: 从 Docker 命名卷改为 bind mount 到 /data/dsh-hub
  - upgrade.sh: DATA_DIR 默认值从 /opt/dsh-hub/dsh-hub/data 改为 /data/dsh-hub
  - 数据目录独立于代码仓库，避免 git pull 影响
  - 为后续挂载独立数据盘预留路径

### 插件系统
- **修复 dsh 插件安装命令**
  - 从 `dsh install` 改为 `dsh plugin --profile web add`
  - 使用正确的包名（dshmarket、@xmanrui/dsh-im 等）
  - dsh-im 需要 -w 参数（workspace 模式）
  - 插件复制：使用 pluginMap 映射不同的包名

- **使用正确的插件安装命令和来源**
  - dshmarket: npm 包
  - dsh-better-sidebar: GitHub 仓库（github:omdsh-dev/DSH-better-sidebar#main）
  - dsh-im: npm 包（dsh plugin --profile web add -w @xmanrui/dsh-im）
  - dsh-cost-meter: GitHub 仓库（github:Han-1413141/dsh-cost-meter#main）
  - dsh-visualize: npm 包

- **Dockerfile 插件预装改为可选，失败不阻断构建**
  - 每个插件安装命令用 () 包裹，失败时输出警告但不中断构建
  - 预装是优化功能，instances.ts 有运行时回退机制

- **修复 Dockerfile 中插件安装命令语法**
  - 安装 pnpm（dsh plugin add 需要）
  - 使用正确的命令语法：`dsh plugin --profile web add <plugin>`
  - 设置 DSH_HOME 环境变量指向模板目录

### Workspace 功能
- **Workspace 流程收尾 - 支付/首页/登录后统一跳转到 Workspace**
  - Phase 1: 支付返回页按钮改为「进入工作区」
  - Phase 2: 首页重定向到/workspace
  - Phase 3: 登录后跳转到/workspace

- **添加 GET /instances 实例列表页路由**
  - 显示当前用户的实例列表
  - 使用 layout() 函数包装页面（包含导航栏）
  - 需要登录认证

- **调整 Workspace 导航栏 z-index 和布局**
  - 导航栏 z-index 从 10000 降低到 100
  - 下拉菜单 z-index 从 10001 降低到 101
  - 移除 .workspace-content 包裹层
  - 改为调整 body 的 margin-top: 60px
  - 确保 DSH 实例顶部栏不被遮挡

- **Workspace 页面添加 DSH Hub 导航栏**
  - 在 DSH 实例 HTML 中注入导航栏（固定在顶部）
  - 导航栏包含：品牌名、用户头像、下拉菜单
  - 下拉菜单包含：个人中心、实例管理、退出系统
  - 点击外部自动关闭下拉菜单
  - DSH 实例内容区域自动下移 60px（导航栏高度）

- **Workspace loading 页面添加 CSRF token 支持**
  - 从 cookies 中获取 CSRF token
  - 在 loading 页面 HTML 中注入 `<meta name="csrf-token">`
  - POST 请求携带 X-CSRF-Token header
  - 修复 403 Forbidden 错误

### 页面布局
- **调整页面布局，普通页面居中留白，workspace 满屏显示**
  - .container: max-width 从 1200px 改为 960px，增加两侧留白
  - 新增 .workspace-container: 满屏布局，用于 workspace 页面
  - padding 从 1.5rem 改为 2rem 1.5rem，增加上下留白

- **调整管理员页面布局，增加留白和响应式支持**
  - .admin-layout: 添加 max-width: 100%
  - .admin-sidebar: 添加 flex-shrink: 0 防止侧边栏被压缩
  - .admin-content: padding 从 1.5rem 改为 2rem 1.5rem，添加 min-width: 0

### 问题修复
- **修复实例详情页日志刷新按钮链接**
  - 日志刷新按钮链接从 /instances/:id/logs 改为 /instances/:id
  - 实例详情页已经会获取并显示日志，无需单独的日志路由

---

## 2026-09-03

### Workspace 功能
- **Workspace 直接嵌入 DSH 实例**
  - Phase 1: 基础代理（HTML 重写 + 注入配置 + 入口路由）
  - Phase 2: 通配代理 + API 代理 + SPA fallback
  - Phase 3: WebSocket + CSS 重写 + 自动启动
  - Phase 4: 付费后自动进入 Workspace
  - Phase 5: 导航栏增强

### 插件系统
- **Docker 镜像预装插件，实例创建时快速复制**
  - Dockerfile: 在构建时预装 5 个默认插件到 /opt/dsh-home-template
  - instances.ts: 新增 copyPreinstalledPlugins 函数
  - 实例创建时优先从模板目录复制插件（秒级完成）
  - 模板复制失败时回退到 dsh install（备用方案）
  - 新增 TEMPLATE_DSH_HOME 环境变量配置

- **在实例创建时自动安装默认插件**
  - 新增 DEFAULT_PLUGINS 常量（dsh-market、dsh-better-sidebar、dsh-im、dsh-cost-meter、dsh-visualize）
  - 在 startInstance 中检测 .plugins-installed 标记文件
  - 首次启动时自动安装所有默认插件
  - 安装完成后创建标记文件避免重复安装
  - 插件安装失败不阻塞实例启动

### 数据持久化
- **添加 docker-compose.yml 确保数据持久化**
  - 定义 dsh-hub-data 命名卷
  - 将 /data 目录挂载到命名卷
  - 添加健康检查
  - 添加 restart: unless-stopped 策略
  - 包含环境变量配置示例

- **添加数据持久化指南和修复方案**
  - 新增 DATA_PERSISTENCE.md 详细说明数据持久化配置
  - 更新 docker-compose.yml 添加更清晰的卷配置注释
  - 说明 Docker 命名卷和宿主机目录挂载两种方式
  - 提供升级时保留数据的正确流程
  - 提供数据迁移和恢复方法

### 网关代理
- **添加 DSH 插件 API fallback 路由**
  - 处理 /i/<plugin-name>/* 格式的请求（不符合实例路径规范）
  - 例如：/i/dsh-market/registry → 代理到用户运行中的实例
  - strip /i 前缀，变成 /dsh-market/registry 再代理
  - 需要用户已认证且有运行中的实例

### 问题修复
- **配置 pnpm 允许构建脚本以支持 node-pty 等原生模块**
  - 在插件安装前创建 .npmrc 文件
  - 设置 ignore-scripts=false 允许构建脚本执行
  - 增加安装超时时间到 120 秒（原生编译需要更长时间）
  - 解决 dsh-better-sidebar 安装失败问题

- **修复下拉菜单样式和付费后自动启动实例问题**
  - 下拉菜单样式修复：增加 z-index 到 10000，添加 border 边框
  - 付费后自动启动实例修复：查找 stopped 或 failed 状态的实例

- **修复下拉菜单文字颜色问题，使用!important强制覆盖**

---

## 2026-09-02

### 核心功能
- **DSH Deployment API Base 动态化**
  - 从 Referer 头提取实例路径
  - 动态生成 apiBase 和 wsBase（格式：/i/<userSlug>-<instanceId>）
  - 无 Referer 或不匹配时返回空字符串（向后兼容）
  - 响应头设置 Cache-Control: no-cache, no-store
  - 删除硬编码的 DSH_DEPLOYMENT_JS 常量

- **配置统一化 + 会员到期定时任务**
  - config.ts: 新增 getDataDir/getSmtpConfig/getDshBin/getExpiryCheckInterval
  - db.ts: 使用 getDataDir() 替代直接读取 process.env
  - email.ts: 使用 config.ts 的 getSmtpConfig()，删除本地定义
  - paths.ts: 使用 getDataDir() 替代直接读取 process.env
  - supervisor/spawn.ts: 使用 getDshBin() 替代直接读取 process.env
  - scheduler.ts: 新增定时任务调度器（会员到期检查 + 到期提醒）
  - index.ts: 集成调度器启动/停止

### 订单系统
- **优化订单功能**
  - 新增订单号生成规则（YYYYMMDDHH+10 位随机数）
  - 记录虎皮椒支付订单号（open_order_id）
  - 记录支付成功时间（paid_at）
  - 恢复时间相关代码，保留调试日志

- **修复虎皮椒 API 响应解析**
  - 响应数据在 data 字段中，不是直接在根级别
  - 修改响应解析逻辑

- **添加虎皮椒 API 响应日志**

### 时间显示
- **修复时间显示时区问题，强制使用 Asia/Shanghai 时区**
  - 所有时间显示添加 `timeZone: 'Asia/Shanghai'` 参数
  - 包括订单时间、会员到期时间、审计日志时间等

### 支付优化
- **优化支付体验**
  - 零金额订单跳过支付弹窗，直接显示 loading 并跳转成功页
  - 支付弹窗添加 10 分钟倒计时显示
  - 订单超时自动取消（10 分钟）
  - 添加"取消支付"和"已支付"按钮
  - 新增取消订单 API（POST /api/payment/cancel/:orderId）
  - 查询 API 返回 cancelled 状态

### 部署修复
- **修复数据持久化问题，确保使用/mnt/data 存储**

### 认证优化
- **移除登录页面重复的注册链接**

### Docker 优化
- **修复 .dockerignore 排除部署脚本的问题**

---

## 2026-09-01

### 核心功能
- **集成虎皮椒支付系统**
  - 支付模块（payment.ts：虎皮椒签名生成/验证、发起支付、查询订单、退款）
  - 配置管理（settings.ts 新增 xunhupay_appid/appsecret，管理后台支付配置表单）
  - 订单流程改造（创建订单为 pending 状态，支付回调后激活会员）
  - API 路由（POST /api/payment/create、POST /api/payment/notify、GET /api/payment/query/:orderId）
  - 前端支付流程（AJAX 创建订单 → 二维码弹窗 → 轮询支付状态 → 成功跳转）
  - 支付成功返回页（/payment/return）

- **完成 UI 视觉风格重设计**
  - CSS 变量与设计系统重写（主色 #0066cc，圆角输入框，卡片阴影）
  - 导航栏更新（黑色背景，"乌鸦 work" 品牌名，用户头像）
  - 认证页面重设计（登录/注册/忘记密码/重置密码，居中卡片布局）
  - 会员购买页重设计（三栏定价卡片，推荐高亮）
  - 个人中心页重设计（会员状态卡片，订单表格）
  - 管理后台页面重设计（侧边栏导航，表格布局）

- **会员系统与订单管理功能**
  - 数据库 Migration v4（users 新增会员字段 + memberships/orders 表）
  - 会员核心逻辑（membership.ts：激活/到期检查/管理员设置）
  - 订单逻辑（创建订单为 pending 状态，支付成功后激活会员）
  - 定时任务（scheduler.ts：每日 0 点检查会员到期）
  - 页面路由（/membership 购买页、/profile 个人中心、/admin/membership 管理）
  - 注册/登录流程调整（无会员重定向到购买页）
  - 会员激活后自动创建 DSH 实例
  - 网关会员检查（非会员访问实例重定向到购买页）
  - API 路由（/api/membership/plans、/api/me/membership、/api/me/orders、/admin/api/orders）
  - 管理员用户管理页面显示会员标识 + 设置会员
  - 管理员创建用户时可选会员身份

### 问题修复
- **修复 WebSocket 代理中 targetPath 变量引用顺序错误**
- **代理 DSH WebSocket 事件通道到用户实例**
  - /api/events.mux、/api/events.host 代理到用户实例
  - 修复设置页面加载失败问题
- **buildInstanceUrl 剥离 domain 协议前缀**
- **修复实例路径解析错误导致网关 404**
- **实例链接使用 instance.trusted_host 替代 config.hubDomain**
- **/dsh-deployment.js 添加 Cache-Control 头**
- **剥离并重写 Origin 头与 Host 一致**
- **Hub 层直接提供 /dsh-deployment.js**
- **添加 /dsh-deployment.js 静态资源 fallback 代理**
- **用 http.request 替代 fetch，保留原始 Host 头**
- **添加 DSH API fallback 代理（/api/host.* 等）**
- **端口范围避开 4000（DSH 内部插件端口）**
- **添加静态资源 fallback 代理（/assets/ 和 /plugins/）**
- **修复 trusted_host 格式，dsh 只接受 host[:port] 格式**
- **修复 Trusted Host 显示为完整路径格式**
- **管理员创建用户表单增加账号字段**
- **管理后台用户列表增加账号字段**
- **网关从子域名路由改为路径路由**
- **getUserByAccount 支持 nickname 向后兼容**
- **部署脚本默认 DSH_HUB_DOMAIN 为 hub.wuyajun.cn**
- **撤销 /setup 自动创建实例，仅 /register 注册后自动创建**
- **/setup 创建管理员后自动创建实例**
- **修复退出登录后跳转到错误 URL**
- **修复部署时 /mnt/data 权限问题**
- **修复部署后数据丢失问题，使用持久化存储**
- **注册表单内容保留 + 退出登录统一跳转**
- **修复 /setup 创建管理员时未设置 username 导致无法登录**
- **修复 dsh 不存在时 spawn 导致进程崩溃**
- **修复部署时数据目录创建失败问题**

### 移动端适配
- **移动端适配 + 认证增强**
  - 响应式布局
  - username/email/找回密码功能

### Docker 优化
- **添加 Dockerfile 和 .dockerignore**
- **添加 TRUST_PROXY 和 COOKIE_SECURE 环境变量默认值**

---

## 2026-08-31

### 代码质量优化
- **完成 P0-P3 代码优化任务**
  - P0: gateway-auth-fix 网关鉴权缺陷修复
  - P1: page-csrf-protection 页面表单 CSRF 全覆盖
  - P1: logic-dedup 提取 attemptLogin、disableUser、createUserRow
  - P2: supervisor-modularization supervisor 拆分为 7 个子模块
  - P3: proxy-streaming HTTP 代理改流式转发 + WS close frame
  - P3: db-schema-versioning Schema 迁移版本化（schema_version 表）
  - P3: instance-state-machine 实例状态机形式化（transitionStatus）

### 架构改进
- **实例状态机形式化**
  - transitionStatus + forceStatus
  - 状态转换校验
  - stale 状态校正

- **Schema 迁移版本化**
  - schema_version 表
  - 增量迁移机制

- **HTTP 代理改流式转发**
  - WebSocket close frame 支持
  - 流式转发优化

- **supervisor 拆分为子模块**
  - probe/lock/pidfile/log/spawn/stop/reclaim
  - 模块化设计

### 网关改进
- **实现 M3 鉴权网关**
  - 子域路由 + WS 隧道 + 自动实例
  - 所有权校验
  - WebSocket 隧道

- **网关从子域名路由改为路径路由**
  - 更灵活的路由方式
  - 支持多实例

### 部署优化
- **添加升级和回滚脚本**
- **修复部署时数据目录创建失败问题**
- **修复部署时 /mnt/data 权限问题**

### 认证增强
- **注册表单内容保留 + 退出登录统一跳转**
- **移动端适配 + 认证增强（username/email/找回密码）**

### Web UI
- **实现 Web UI MVP（服务端渲染方案）**
  - 服务端渲染
  - 页面模板系统

---

## 2026-08-23

### 发布准备
- **发布准备（push-release 脚本 + 文档）**
- **M2.1: 安全修复与结构优化**

---

## 2026-08-22

### 核心功能
- **M2: 实例生命周期 + 昵称目录**
  - 29/29 冒烟测试通过
  - 真实 dsh web 实例支持
  - 昵称目录隔离

- **M1: 认证与用户体系**
  - 24/24 冒烟测试通过
  - 首位注册 root 专项通过
  - 用户注册/登录/登出

- **M0: 调研文档 + dsh-hub 脚手架 + Spike S1-S5 全部完成**
  - 调研文档
  - 脚手架搭建
  - Spike 验证（S1-S5）

---

## 技术栈

- **语言**: TypeScript（Node.js ≥ 24）
- **运行时依赖**: 零（仅使用 Node.js 内置模块）
- **数据库**: SQLite（node:sqlite）
- **包管理**: pnpm
- **部署**: Docker + OpenResty

---

## 项目结构

```
/workspace/projects/
├── .coze                    # 平台配置
├── AGENTS.md                # 项目规范与经验
├── CHANGELOG.md             # 系统迭代记录（本文档）
├── README.md                # 项目说明
├── docs/                    # 调研笔记 / 开发计划 / 进展日志
├── openspec/                # OpenSpec 规范驱动开发
│   ├── specs/               # 已实现的功能规范
│   └── changes/             # 待实现/已归档的变更提案
└── dsh-hub/                 # 控制面实现（主代码目录）
    ├── src/                 # TypeScript 源码
    ├── scripts/             # 冒烟测试与运维脚本
    ├── Dockerfile           # Docker 镜像构建
    ├── docker-compose.yml   # Docker 编排配置
    └── package.json
```

---

## 关键模块

- **入口**: `dsh-hub/src/index.ts`
- **配置**: `dsh-hub/src/config.ts`
- **数据库**: `dsh-hub/src/db.ts`
- **HTTP 服务器**: `dsh-hub/src/http.ts`
- **API 路由**: `dsh-hub/src/api.ts`
- **页面路由**: `dsh-hub/src/pages.ts`
- **认证**: `dsh-hub/src/auth.ts`
- **会话管理**: `dsh-hub/src/sessions.ts`
- **用户管理**: `dsh-hub/src/users.ts`
- **实例管理**: `dsh-hub/src/instances.ts`
- **进程监管**: `dsh-hub/src/supervisor/`
- **HTTP/WS 代理**: `dsh-hub/src/proxy.ts`
- **鉴权网关**: `dsh-hub/src/gateway.ts`
- **会员系统**: `dsh-hub/src/membership.ts`
- **支付集成**: `dsh-hub/src/payment.ts`
- **定时任务**: `dsh-hub/src/scheduler.ts`
- **页面视图**: `dsh-hub/src/views/`

---

## 部署架构

```
用户浏览器
    ↓
OpenResty (反向代理)
    ↓
dsh-hub (Node.js, 端口 3082)
    ↓
DSH 实例 (端口 4001-4999)
```

**数据持久化**: `/data/dsh-hub` (bind mount)

**网络配置**: 
- dsh-hub: 172.18.0.100 (静态 IP)
- 网络：1panel-network

---

## 开发规范

- **OpenSpec 规范驱动开发**: 先写规范，再写代码
- **运行时零依赖原则**: 不引入运行时 npm 依赖
- **Node.js ≥ 24**: 使用原生模块
- **pnpm**: 包管理工具
- **TypeScript**: 类型安全

---

## 维护说明

- 本文档由系统自动生成，每天凌晨 3 点更新
- 更新内容基于 git 提交历史
- 如需修改文档格式或内容，请联系管理员
