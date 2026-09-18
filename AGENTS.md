## 项目概述

DSH Hub（DeepSeek Harness 多租户多实例管理器）：在单台 Linux 服务器上为多人提供各自独立的 DeepSeek Harness（`dsh web`）浏览器实例。支持网页登录、按用户隔离的昵称目录、实例生命周期管理（创建/启停/重启/删除/日志/孤儿回收）、管理员后台（用户管理/封禁/配额/版本白名单/审计）、会员与支付。

- **Git 仓库**：`git@github.com:keeliu/dsh-hub.git`（SSH），主分支 `main`。
- **生产域名**：`hub.wuyajun.cn`（前置 OpenResty 反向代理；另有 1panel 网络部署）。
- **仓库根**：即本 `AGENTS.md` 所在目录（`<repo>/`）；控制面应用代码在其下的 `dsh-hub/` 子目录。

## 技术栈

- **语言**：TypeScript（Node.js ≥ 24 原生运行，`node --disable-warning=ExperimentalWarning src/index.ts`）
- **运行时依赖**：零（仅使用 Node.js 内置模块，含 `node:sqlite`）
- **开发依赖**：`typescript ^5.9.0`、`@types/node ^24.0.0`
- **包管理**：应用用 npm（有 `package-lock.json`）；DSH 插件安装走 pnpm（v11）
- **模块系统**：ESM（`"type": "module"`）
- **数据库**：内置 `node:sqlite`（SQLite）
- **构建（类型检查）**：`tsc -p .`（`noEmit: true`）
- **容器**：Docker 多阶段构建（基础镜像 `node:24-slim`）

## 目录结构

```
<repo-root>/                    # git 仓库根（本 AGENTS.md 所在）
├── AGENTS.md                   # 本文件
├── CHANGELOG.md                # 系统迭代记录（每晚 02:00 自动更新，见「CHANGELOG 自动更新」）
├── README.md
├── .dockerignore               # 仓库根【构建上下文】的忽略规则（排除 .git/node_modules/文档等）
├── .coze / .codegraph / .openspec
├── assets/                     # 资源
├── docs/                       # 调研笔记 / 开发计划 / Spike 验证 / 进展日志
├── openspec/                   # OpenSpec 规范驱动开发
│   ├── specs/                  # 已实现功能规范（真相之源，含 standards.md）
│   └── changes/                # 变更提案（进行中）+ archive/（已归档）
├── scripts/                    # 仓库级运维/构建脚本
│   ├── build-image.sh          # 构建镜像（自动切到仓库根上下文）
│   ├── update-changelog.mjs    # CHANGELOG 非破坏性自动更新（追加当天提交）
│   ├── update-changelog.sh     # 上面脚本的 bash 包装（cron: 0 2 * * *）
│   ├── changelog-daemon.sh     # 无 cron 环境的每日 02:00 常驻调度
│   └── deploy_build.sh / deploy_run.sh / rollback.sh / upgrade.sh
└── dsh-hub/                    # 控制面应用（Dockerfile / docker-compose.yml 所在）
    ├── src/                    # TypeScript 源码
    │   ├── index.ts            # 入口（启动、孤儿认领、优雅关闭）
    │   ├── config.ts           # 配置中心 + getTemplateDshHome / ensureProfileAllowBuilds
    │   ├── presets.ts          # 预置插件清单（运行期可配置：get/setPresetPlugins、activePreset*、validatePresetPlugins）
    │   ├── db.ts               # SQLite（schema 版本化迁移）
    │   ├── http.ts             # HTTP 基础设施（HttpError / 响应 / cookie）
    │   ├── api.ts              # API 路由 + HTTP 服务入口（startServer）
    │   ├── auth.ts / sessions.ts / users.ts
    │   ├── instances.ts        # 实例 CRUD + copyPreinstalledPlugins / templateHasAllPlugins / installDefaultPlugins
    │   ├── gateway.ts          # 鉴权网关（/i/<slug>-<id> 路由、workspace 代理、导航注入）
    │   ├── proxy.ts / subdomain.ts
    │   ├── membership.ts / payment.ts / settings.ts / scheduler.ts / email.ts
    │   ├── version.ts / paths.ts / port.ts / pwd.ts
    │   ├── supervisor/         # 进程监管（拆分为子模块）
    │   │   ├── index.ts        # 公共 API + InstanceRecord + 状态机
    │   │   ├── probe.ts / lock.ts / pidfile.ts / log.ts / spawn.ts / stop.ts / reclaim.ts
    │   ├── pages.ts            # 页面路由（SSR）
    │   └── views/              # 页面视图（layout / auth / user / admin）
    ├── scripts/                # 应用内脚本
    │   ├── patch-dsh-client.sh # DSH 客户端 loopback 补丁（镜像启动时执行）
    │   ├── install-default-plugins.sh
    │   └── m1-smoke.sh / m2-smoke.sh / security-regression.sh 等
    ├── spikes/                 # 技术验证脚本（S1-S5）
    ├── Dockerfile              # 多阶段构建（template-builder + 最终镜像）
    ├── docker-compose.yml      # build.context=.. / dockerfile=dsh-hub/Dockerfile
    ├── .dockerignore           # app 目录上下文的忽略规则（旧路径构建用）
    ├── package.json / package-lock.json / pnpm-lock.yaml / tsconfig.json
    └── README.md / DATA_PERSISTENCE.md
```

> 注意：路径统一以**仓库根**为基准（`dsh-hub/src/...` 即 `<repo-root>/dsh-hub/src/...`）。仓库里有两个 `scripts/`：仓库根的（运维/构建）与应用内的（冒烟测试、patch）。

## 关键入口 / 核心模块

- **入口**：`dsh-hub/src/index.ts`
- **配置**：`dsh-hub/src/config.ts`（环境变量：`DSH_HUB_DATA`、`DSH_HUB_HOST`、`DSH_HUB_PORT`、`DSH_HUB_COOKIE_SECURE`、`DSH_BIN`、`DSH_HUB_DOMAIN`、`DSH_HUB_TRUST_PROXY`、`TEMPLATE_DSH_HOME`）
- **默认监听**：`127.0.0.1:3082`
- **角色体系**：root / admin / user
- **认证**：session cookie + Bearer API token 双轨
- **登出**：`POST /api/auth/logout`（页面表单用）；`GET /logout` 保留作浏览器直接访问兜底

## 运行与预览

- 本项目为纯后端 API 服务（`project_type = "backend"`），无可视化预览
- 启动：`cd dsh-hub && node --disable-warning=ExperimentalWarning src/index.ts`（相对仓库根）
- 类型检查：`cd dsh-hub && npx tsc -p . --noEmit`
- 冒烟测试：`dsh-hub/scripts/m1-smoke.sh`（24 项）、`m2-smoke.sh`（29 项）、`security-regression.sh`（38 项）
- **沙箱限制**：`dsh` 二进制在本环境不可用，涉及 `dsh web` 实例的端到端测试无法在此运行。

## Docker 构建与部署

**构建上下文必须是【仓库根】**（含 `dsh-hub/` 与 `scripts/` 的那一层）。Dockerfile 的 `COPY` 使用**仓库根相对路径**（`dsh-hub/...`）。

```bash
# 方式 A：仓库根直接构建（推荐）
cd <repo-root>
bash scripts/build-image.sh                 # 或：
docker build -f dsh-hub/Dockerfile -t dsh-hub:latest .

# 方式 B：compose（在应用目录执行；其 build.context 指向仓库根 ..）
cd <repo-root>/dsh-hub
docker compose up --build -d
```

> ⚠️ 不要从仓库根用 `-f dsh-hub/Dockerfile .` 之外的错误上下文，也不要 `cd` 到应用目录后直接 `docker build .`（COPY 路径会错位）。

**多阶段构建**：
1. `template-builder` 阶段：装 `git python3 build-essential` + pnpm + dsh，把 5 个默认插件预装进 `/opt/dsh-home-template/profiles/web`，并在构建期校验模板 `dependencies` 覆盖全部默认插件（缺任一即构建失败）。
2. 最终镜像阶段：装 `git python3 build-essential` + pnpm + dsh，`COPY --from=template-builder` 模板，**只复制 `dsh-hub/src` 与 `package*.json`/`tsconfig.json`**（不再整体 `COPY dsh-hub/`，避免把构建机的 `node_modules` 带进镜像产生覆盖冲突），再单独复制 `patch-dsh-client.sh` 到 `/usr/local/bin`。

**构建期关键依赖（踩过的坑，务必保留）**：
- **`allowBuilds: node-pty: true`**：pnpm v10+/11 默认不执行依赖生命周期脚本；`dsh-better-sidebar` 的 `node-pty` 需 node-gyp 编译，必须在 profile 的 `pnpm-workspace.yaml` 里显式批准，否则安装被忽略而失败。
- **`python3` + `build-essential`**：node-gyp 编译原生模块需要 Python + make/g++。

**运行环境**：
- 数据持久化：`/data/dsh-hub`（bind mount，独立于代码仓库）
- 插件模板：`/opt/dsh-home-template`（构建期产出，运行时只读复制给实例）
- 容器网络：`1panel-network`（固定 IP，供 OpenResty 可靠代理）
- 启动：镜像 CMD 先执行 `patch-dsh-client.sh`，再 `node ... src/index.ts`

## CHANGELOG 自动更新

- 由 `scripts/update-changelog.mjs` 实现：把**当天的新提交**追加为一段 `## <日期>` 区块（新的在上），并更新「最后更新」日期；**非破坏性**，不重写既有内容。
- 调度：`scripts/update-changelog.sh`（cron 行：`0 2 * * *`）；无 cron/systemd 的容器可用 `scripts/changelog-daemon.sh` 常驻每日 02:00 触发。
- 用系统 `date` 取本地日期（本机为 CST/UTC+8），避免 Node 默认 UTC 造成日期错位。

## 当前进度

- M0–M2.1 已完成（调研/脚手架/认证/生命周期/安全修复）
- M3 鉴权网关已完成（子域路径路由 `/i/<slug>-<id>` + 所有权校验 + WS 隧道）
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
  - 实例链接域名错误 / 不完整（使用 `instance.trusted_host`；`buildInstanceUrl` 剥离协议前缀）
  - WebSocket 事件通道断裂（/api/events.mux、/api/events.host 未代理到实例）
  - WebSocket 代理 Host/Origin 头不一致（与 HTTP 代理统一修复）
  - **退出登录 404**：网关注入的工作区导航「退出系统」原用 `GET /logout`（部分部署未注册该路由 → 404）。已改为 `POST /api/auth/logout`（表单提交，实测 303→/login 且 session 正确清除）；`GET /logout` 保留兜底。
  - **Docker 构建链路修复**（2026-09-06）：构建上下文统一为仓库根 ← 这是本仓库最容易踩的坑。若构建报 `scripts/patch-dsh-client.sh not found`，说明上下文用错（见「Docker 构建与部署」）。
- **会员系统已完成**（openspec/changes/membership-system/）：Migration v4（会员字段 + memberships/orders 表）、`membership.ts`（激活/到期/管理员设置）、订单（pending→支付激活）、`scheduler.ts` 每日到期检查、页面（/membership、/profile、/admin/membership）、注册/登录/首页按会员重定向、会员激活自动建实例、网关会员检查、API（/api/membership/plans、/api/me/membership、/api/me/orders、/admin/api/orders）。
- **UI 视觉重设计已完成**（openspec/changes/ui-redesign/）：CSS 变量/设计系统（主色 #0066cc）、黑色导航栏「乌鸦 work」+ 用户头像、认证页居中卡片、会员购买三栏卡片、个人中心、管理后台侧边栏。
- **支付集成已完成**（openspec/changes/payment-integration/）：`payment.ts`（虎皮椒签名/发起/查询/退款）、settings 配置 appid/appsecret、订单改 pending + 回调激活、API（POST /api/payment/create、POST /api/payment/notify、GET /api/payment/query/:orderId）、前端二维码+轮询、/payment/return。
- **支付体验与价格管理已完成**（free-trial-and-pricing-display / payment-callback-and-pricing）：Migration v5/v6（membership_prices 表 + original_price）、双价格展示（原价删除线+优惠价）、零金额订单跳过支付、支付弹窗 10 分钟倒计时/取消/已支付按钮、/admin/prices 价格管理、订单超时取消（POST /api/payment/cancel/:orderId）。
- **工作区/实例页修复**：fix-workspace-fullscreen（`/workspace` 满屏 + body 高度 `calc(100vh - 60px)`）、fix-duplicate-navbar（`/instances` 重复导航栏）。
- **会员实例预置插件自动装载**（openspec/changes/member-instance-template/）：**代码已落地，待生产验证**
  - Docker `template-builder` 预装 5 个默认插件到 `/opt/dsh-home-template`，最终镜像复制该模板。
  - 默认清单（原 `DEFAULT_PLUGINS`，现为 `presets.ts::DEFAULT_PRESET_PLUGINS`）：`dshmarket`、`dsh-better-sidebar`、`@xmanrui/dsh-im`、`dsh-cost-meter`、`dsh-visualize`（**全部 npm 源**，规避 `github:` 源的构建期失败）。
  - `copyPreinstalledPlugins()`：复制整棵 `profiles/` 到 `homePath/profiles/`（DSH 真实布局），复制前用 `templateHasAllPlugins()` 校验模板 `dependencies` 覆盖全部插件；缺插件返回 `false` 走真装。
  - **标记乐观化**：`installDefaultPlugins()` / `spawn.ts` 只在**全部插件成功**后才写 `.plugins-installed`（失败不写、可重试），避免"空模板+完成标记"锁死补救路径。
  - `ensureProfileAllowBuilds()`（`config.ts`）：在 profile 的 `pnpm-workspace.yaml` 写入 `allowBuilds: node-pty: true`（pnpm v11 批准原生构建），运行时安装前调用。
  - 存量被旧逻辑固化的实例需**删除重建或手动补装**。
- **管理后台管理预置插件**（openspec/changes/preset-plugin-management/）：**代码已落地，待生产验证**
  - 预置插件清单从编译期常量改为**运行期可配置**：新增 `src/presets.ts`（`PresetPlugin { spec, enabled, order, allowBuild, workspace }`、`DEFAULT_PRESET_PLUGINS`、`getPresetPlugins` / `setPresetPlugins` / `activePresetSpecs` / `activePresetItems` / `activeAllowBuilds` / `validatePresetPlugins`），清单存 `settings` 表 JSON 键 `preset_plugins`；无配置/解析失败/非法 → 回退默认，绝不抛错。
  - 装载链路（`instances.ts::copyPreinstalledPlugins` / `installDefaultPlugins`、`spawn.ts::startInstance`）改读动态清单；`-w` 依单项 `workspace`，`allowBuilds` 依 `activeAllowBuilds`（插件 spec + 已知原生依赖 `node-pty`）。`config.ts` 的 `ensureProfileAllowBuilds(homePath, packages)` 改为接收动态列表。
  - **命令防注入**：新增 `runPluginAdd(bin, spec, workspace, opts)`，用 `spawn(bin, argv[], { shell:false })` 取代 `execSync(字符串)`；`validatePresetPlugins` 仅允许合法 npm 包名（拒绝 shell 元字符/空/超长）。
  - 管理后台：`GET /admin/api/preset-plugins`（读）、`PUT /admin/api/preset-plugins`（整表替换 + 校验 + 审计 `preset_plugins_update`）、`/admin/plugins` 页面（表格增删/排序/启停/勾选 allowBuild 与 workspace），并入 admin 侧边栏。
  - 边界：**仅对新建实例生效**（已建实例不回溯；移除插件不自动从已建实例卸载）。
- **CHANGELOG 自动更新已上线**：见上文「CHANGELOG 自动更新」。

## 架构要点

- **状态机**：实例状态转换通过 `transitionStatus(db, id, to)` 统一校验，非法转换抛错；stale 状态校正用 `forceStatus`
- **Schema 迁移**：`db.ts` 中的 `MIGRATIONS` 数组定义版本化迁移，旧数据库自动推断版本
- **CSRF 保护**：页面表单 POST 走 `assertPageCsrf`（`_csrf` 字段 + `<meta name="csrf-token">`）；API 写操作走 `assertCsrf`（`X-CSRF-Token` 头，仅会话鉴权时校验）
- **用户创建**：统一通过 `createUserRow()` 函数，自动生成 slug/dir_name
- **预置插件清单**：`presets.ts` 为单一真相源（`settings` 键 `preset_plugins`，回退 `DEFAULT_PRESET_PLUGINS`；`activeAllowBuilds` 合并已知原生依赖 `node-pty`）；`getTemplateDshHome()` / `ensureProfileAllowBuilds()` 在 `config.ts`
- **插件装载链路**：模板复制（已校验完整性）→ 失败降级 `installDefaultPlugins()` 按当前清单逐包真装 → `spawn.ts` 启动兜底；全部受 `.plugins-installed` 门控
- **命令执行安全**：插件安装统一走 `instances.ts::runPluginAdd`（`spawn(argv[], { shell:false })`），spec 经 `validatePresetPlugins` 校验，杜绝命令注入

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

- **Docker 构建上下文**：必须用**仓库根**（`docker build -f dsh-hub/Dockerfile .`）。报 `scripts/patch-dsh-client.sh not found` 基本都是上下文用错。`git` 供 `github:` 源依赖；`python3 build-essential` 供 node-gyp。
- **pnpm 原生模块构建被忽略**：pnpm v10+/11 默认不跑依赖构建脚本。若 `dsh plugin add` 报 `ERR_PNPM_IGNORED_BUILDS`（如 `node-pty`），需在 profile 的 `pnpm-workspace.yaml` 里 `allowBuilds: <包名>: true`（仓库用 `config.ts` 的 `ensureProfileAllowBuilds()` 自动写入；Dockerfile 里手写一行）。
- **不要 `COPY dsh-hub/ ./` 整体复制**：会把构建机 `node_modules` 带进镜像、覆盖 `npm install` 结果。只 `COPY dsh-hub/src` + `package*.json` + `tsconfig.json`。
- **`.dockerignore`**：仓库根那份是**构建上下文根**的忽略规则（docker 只读上下文根的），应用目录那份只在"从应用目录构建"时生效。
- **部署环境差异**：生产 `hub.wuyajun.cn` 的容器可能落后于仓库 HEAD（例如缺少新路由 → 404）。改完代码要**重建镜像/重启**才生效；仅 `git pull` 不更新已运行的容器。
- 项目原始使用 npm，工作区规范要求 pnpm；已有 `package-lock.json`，迁移需与用户确认。
- `dsh` 二进制在沙箱环境中不可用，涉及 `dsh web` 实例的测试无法在此环境运行。
