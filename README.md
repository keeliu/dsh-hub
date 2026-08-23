# DSH Hub · DeepSeek Harness 多租户多实例管理器

在**单台 Linux 服务器**上为多人提供各自独立的 DeepSeek Harness（`dsh web`）浏览器实例：
网页登录、按用户隔离的昵称目录、实例生命周期（创建/启停/重启/删除/日志/孤儿回收）、
管理员后台（用户管理/封禁/配额/版本白名单/审计）。

- 技术栈：Node.js ≥ 24（原生 TypeScript 运行 + 内置 `node:sqlite`），**运行时零依赖**
- 当前状态：M0–M2.1 完成（调研/脚手架/认证/生命周期/安全修复）；M3 鉴权网关进行中

## 仓库结构

```
docs/                 调研笔记 / 开发计划 / Spike 验证记录 / 进展日志
dsh-hub/              控制面实现（TypeScript 源码 + 冒烟测试 + Spike 脚本）
```

## 核心能力

| 能力 | 说明 |
|---|---|
| 认证 | 首启向导建管理员；注册开关；session cookie（HttpOnly + SameSite=Lax + 滑动 7 天/绝对 30 天）+ Bearer API token 双轨；写操作 CSRF；登录限速（IP+昵称） |
| 角色 | root（管管理员）/ admin（管用户与实例）/ user（仅自己资源）；越权一律 403/404 |
| 实例 | 每实例独立 `DSH_HOME` + 端口（4000–4999）+ workspace；`spawn dsh web` 独立进程组；TCP 探活（180s）+ 失败快照 + 日志轮转；重启后孤儿认领 |
| 配额 | `max_instances` / `max_running` 事务化检查（BEGIN IMMEDIATE，并发不超配） |
| 安全 | 封禁即停实例 + 吊销会话与 token；版本白名单（仅显式 semver）；进程身份校验防 pid 复用误杀；per-instance 并发互斥 |
| 审计 | 登录/建号/凭据/实例全动作入 `audit_logs` |

## 快速开始

```bash
cd dsh-hub
npm install        # 仅 devDependencies（typescript/@types/node）；运行时零依赖
npm run dev        # 监听 127.0.0.1:3082
# 浏览器打开 http://127.0.0.1:3082 → POST /api/auth/setup 建首个管理员（无用户时可用）
```

环境变量（`src/config.ts` 集中定义）：`DSH_HUB_DATA`（数据根）、`DSH_HUB_HOST`、`DSH_HUB_PORT`、
`DSH_HUB_COOKIE_SECURE=1`（置于 Caddy/HTTPS 后启用）、`DSH_BIN`、`DSH_HUB_DOMAIN`（trusted-host 子域后缀）、`DSH_HUB_TRUST_PROXY=1`。

## 测试

```bash
cd dsh-hub
bash scripts/m1-smoke.sh            # 24 项：认证/角色/CSRF/限速/审计（自带启动 hub）
bash scripts/m2-smoke.sh            # 29 项：实例生命周期（真实 dsh web 实例）
bash scripts/security-regression.sh # 38 项：攻击剧本回归（封禁链路/版本注入/并发/崩溃同步）
npx tsc -p . --noEmit               # 类型检查
```

## 文档

- `docs/01-调研笔记.md`：DSH 本体事实与借鉴项目调研
- `docs/02-开发计划.md`：架构、API 草案、里程碑 M0–M6、风险表
- `docs/03-Spike验证记录.md`：S1–S5 技术验证结论（WS 隧道/trusted-host 精确匹配等）
- `docs/00-进展日志.md`：滚动工作状态与断点

## 路线图

- **M3** 鉴权网关：子域路由 + 所有权校验 + WS 隧道（`/api/events.mux|host`）+ 未运行引导页
- **M4** 管理员后台 UI（React + DSH 设计令牌）
- **M5** 加固：systemd-run 限额、per-user 账号严格模式、凭据模板、备份文档
- **M6** 多用户压测与故障注入、部署手册

## 许可

私有项目，仅供作者与其协作伙伴使用。
