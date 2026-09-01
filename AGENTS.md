## 项目概述

DSH Hub（DeepSeek Harness 多租户多实例管理器）：在单台 Linux 服务器上为多人提供各自独立的 DeepSeek Harness（`dsh web`）浏览器实例。支持网页登录、按用户隔离的昵称目录、实例生命周期管理（创建/启停/重启/删除/日志/孤儿回收）、管理员后台（用户管理/封禁/配额/版本白名单/审计）。

## 技术栈

- **语言**：TypeScript（Node.js ≥ 24 原生运行，`node --disable-warning=ExperimentalWarning src/index.ts`）
- **运行时依赖**：零（仅使用 Node.js 内置模块，含 `node:sqlite`）
- **开发依赖**：`typescript ^5.9.0`、`@types/node ^24.0.0`
- **包管理**：项目原始使用 npm（有 `package-lock.json`），工作区规范使用 pnpm
- **模块系统**：ESM（`"type": "module"`）
- **数据库**：内置 `node:sqlite`（SQLite）
- **构建**：`tsc -p .`（仅类型检查，`noEmit: true`）

## 目录结构

```
/workspace/projects/
├── .coze                    # 平台配置
├── AGENTS.md                # 本文件
├── README.md                # 项目说明
├── docs/                    # 调研笔记 / 开发计划 / Spike 验证 / 进展日志
│   ├── 00-进展日志.md
│   ├── 01-调研笔记.md
│   ├── 02-开发计划.md
│   └── 03-Spike验证记录.md
├── openspec/                # OpenSpec 规范驱动开发（先写规范，再写代码）
│   ├── specs/               # 已实现的功能规范（真相之源）
│   │   └── standards.md     # 架构与代码规范（长期约束）
│   └── changes/             # 待实现的变更提案
│       ├── [变更名]/        # 每个变更一个目录
│       │   ├── proposal.md  # Why / What / Impact
│       │   ├── design.md    # 技术方案
│       │   ├── tasks.md     # 实施清单
│       │   └── specs/       # 规范增量（Given/When/Then）
│       └── archive/         # 已归档的变更
└── dsh-hub/                 # 控制面实现（主代码目录）
    ├── src/                 # TypeScript 源码
    │   ├── index.ts         # 入口
    │   ├── config.ts        # 配置中心（环境变量集中读取）
    │   ├── db.ts            # SQLite 数据库（含 schema 版本化迁移）
    │   ├── http.ts          # HTTP 服务器
    │   ├── api.ts           # API 路由
    │   ├── auth.ts          # 认证逻辑（含 attemptLogin）
    │   ├── sessions.ts      # 会话管理（含 CSRF）
    │   ├── users.ts         # 用户管理（含 createUserRow、disableUser）
    │   ├── instances.ts     # 实例管理
    │   ├── supervisor/      # 进程监管（拆分为子模块）
    │   │   ├── index.ts     # 公共 API + InstanceRecord + 状态机
    │   │   ├── probe.ts     # TCP 探活 + 进程检测
    │   │   ├── lock.ts      # 锁管理
    │   │   ├── pidfile.ts   # pidfile 管理
    │   │   ├── log.ts       # 日志轮转 + 尾部读取
    │   │   ├── spawn.ts     # 启动逻辑
    │   │   ├── stop.ts      # 停止逻辑
    │   │   └── reclaim.ts   # 孤儿认领
    │   ├── proxy.ts         # HTTP/WS 代理（流式转发）
    │   ├── gateway.ts       # 鉴权网关
    │   ├── subdomain.ts     # 子域路由
    │   ├── settings.ts      # 设置
    │   ├── paths.ts         # 路径工具
    │   ├── port.ts          # 端口分配
    │   ├── pwd.ts           # 密码工具
    │   ├── version.ts       # 版本管理
    │   ├── email.ts         # 邮件发送
    │   ├── membership.ts    # 会员系统（会员/订单/到期检查）
    │   ├── scheduler.ts     # 定时任务调度器
    │   └── pages.ts         # 页面路由（SSR）
    │   └── views/           # 页面视图模板
    │       ├── layout.ts    # 布局（含 CSRF meta）
    │       ├── auth.ts      # 认证页面
    │       ├── user.ts      # 用户页面（含会员购买/个人中心）
    │       └── admin.ts     # 管理页面（含会员管理）
    ├── scripts/             # 冒烟测试与运维脚本
    ├── spikes/              # 技术验证脚本（S1-S5）
    ├── package.json
    └── tsconfig.json
```

## 关键入口 / 核心模块

- **入口**：`dsh-hub/src/index.ts`
- **配置**：`dsh-hub/src/config.ts`（环境变量：`DSH_HUB_DATA`、`DSH_HUB_HOST`、`DSH_HUB_PORT`、`DSH_HUB_COOKIE_SECURE`、`DSH_BIN`、`DSH_HUB_DOMAIN`、`DSH_HUB_TRUST_PROXY`）
- **默认监听**：`127.0.0.1:3082`
- **角色体系**：root / admin / user
- **认证**：session cookie + Bearer API token 双轨

## 运行与预览

- 本项目为纯后端 API 服务（`project_type = "backend"`），无可视化预览
- 启动：`cd dsh-hub && node --disable-warning=ExperimentalWarning src/index.ts`
- 类型检查：`cd dsh-hub && npx tsc -p . --noEmit`
- 冒烟测试：`dsh-hub/scripts/m1-smoke.sh`（24 项）、`m2-smoke.sh`（29 项）、`security-regression.sh`（38 项）

## 当前进度

- M0–M2.1 已完成（调研/脚手架/认证/生命周期/安全修复）
- M3 鉴权网关已完成（子域路由 + 所有权校验 + WS 隧道）
- 代码质量优化已完成：
  - P0 gateway-auth-fix：网关鉴权缺陷修复
  - P1 page-csrf-protection：页面表单 CSRF 全覆盖
  - P1 logic-dedup：提取 attemptLogin、disableUser、createUserRow
  - P2 supervisor-modularization：supervisor 拆分为 7 个子模块
  - P3 proxy-streaming：HTTP 代理改流式转发 + WS close frame
  - P3 db-schema-versioning：Schema 迁移版本化（schema_version 表）
  - P3 instance-state-machine：实例状态机形式化（transitionStatus）
- 生产环境问题修复：
  - 实例路径解析 bug（lastIndexOf 问题）
  - 静态资源 404（/assets/、/plugins/、/dsh-deployment.js fallback）
  - DSH API 404（/api/host.* fallback）
  - 代理层 403（Host/Origin 头处理，改用 loopback 地址）
  - 端口 4000 冲突（改为 4001-4999）
  - 实例链接域名错误（使用 instance.trusted_host）
  - 实例链接不完整（buildInstanceUrl 剥离协议前缀）
  - WebSocket 事件通道断裂（/api/events.mux、/api/events.host 未代理到 DSH 实例）
  - WebSocket 代理 Host/Origin 头不一致（与 HTTP 代理统一修复）
- **会员系统已完成**（openspec/changes/membership-system/）：
  - 数据库 Migration v4（users 新增会员字段 + memberships/orders 表）
  - 会员核心逻辑（membership.ts：激活/到期检查/管理员设置）
  - 订单逻辑（创建订单即激活会员，预留支付接口）
  - 定时任务（scheduler.ts：每日 0 点检查会员到期）
  - 页面路由（/membership 购买页、/profile 个人中心、/admin/membership 管理）
  - 注册/登录流程调整（无会员重定向到购买页）
  - 会员激活后自动创建 DSH 实例

## 架构要点

- **状态机**：实例状态转换通过 `transitionStatus(db, id, to)` 统一校验，非法转换抛错；stale 状态校正用 `forceStatus`
- **Schema 迁移**：`db.ts` 中的 `MIGRATIONS` 数组定义版本化迁移，旧数据库自动推断版本
- **CSRF 保护**：所有 POST 表单需携带 CSRF token（`assertPageCsrf`），通过 `<meta name="csrf-token">` 注入
- **用户创建**：统一通过 `createUserRow()` 函数，自动生成 slug/dir_name

## 用户偏好与长期约束

- 运行时零依赖原则：不引入运行时 npm 依赖
- Node.js ≥ 24
- **OpenSpec 规范驱动开发（强制）**：所有功能开发必须先写规范、再写代码

## OpenSpec 开发规范（强制遵循）

本项目采用 OpenSpec 规范驱动开发（Spec-Driven Development），所有功能变更必须遵循以下流程：

### 核心原则
**先写规范，再写代码。** 任何功能改动前，必须先在 `openspec/` 下创建变更提案并通过审查，然后才能开始编码实现。

### 工作流（四步）

1. **Propose（提案）**：创建变更目录 `openspec/changes/<变更名>/`，生成：
   - `proposal.md` — Why（为什么做）、What Changes（做什么）、Impact（影响范围）
   - `specs/` — 功能规范，使用 Given/When/Then 格式描述验收条件
   - `design.md` — 技术方案、关键决策、架构影响
   - `tasks.md` — 实施清单，逐步可勾选的任务列表

2. **Review（审查）**：用户审查规范文档，确认方向正确后进入实施

3. **Apply（实施）**：按 `tasks.md` 逐步实现代码，每完成一项打勾

4. **Archive（归档）**：变更完成后，将目录移至 `openspec/changes/archive/`，并将 specs 合并到 `openspec/specs/` 作为真相之源

### 目录约定
- `openspec/specs/` — 已实现功能的最终规范（唯一真相源）
- `openspec/specs/standards.md` — **架构与代码规范**（分层、安全、去重、工艺等长期约束，所有后续变更必须遵守）
- `openspec/changes/` — 进行中的变更提案
- `openspec/changes/archive/` — 已完成的变更归档

### 强制约束
- **禁止跳过规范直接写代码**：任何功能新增或改动，必须先在 `openspec/changes/` 下创建完整提案
- **规范文档随代码一起提交到 git**：openspec/ 目录必须在版本控制中
- **specs/ 是真相之源**：归档后规范合并到 specs/，后续开发以 specs/ 为准
- **遵守架构与代码规范**：`openspec/specs/standards.md` 中的强制条目对所有后续变更生效，提案和设计中不得违反

## 常见问题和预防

- 项目原始使用 npm，工作区规范要求 pnpm；已有 `package-lock.json`，迁移需与用户确认
- `dsh` 二进制在沙箱环境中不可用，涉及 `dsh web` 实例的测试无法在此环境运行
