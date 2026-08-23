# DSH Hub · 控制面

多人使用的 DeepSeek Harness（dsh）多实例管理器——单台 Linux 服务器，网页登录，
每用户一个昵称目录，实例与数据严格隔离，管理员后台统一管理。

- 项目总览：`../README.md`
- 调研依据：`../docs/01-调研笔记.md` ｜ 开发计划：`../docs/02-开发计划.md` ｜ Spike 验证：`../docs/03-Spike验证记录.md`
- 状态日志：`../docs/00-进展日志.md`

## 目录

```
src/        控制面（TypeScript，Node ≥ 24 原生运行）
  config.ts   环境变量集中定义（单例）
  http.ts     HttpError / 响应 / body / cookie 解析
  auth.ts     统一鉴权（Bearer/会话）+ CSRF + 登录限速
  settings.ts 全局设置读写（注册开关/默认版本/版本白名单）
  version.ts  dsh 版本白名单（显式 semver 校验）
  db.ts       SQLite（WAL + 外键）+ withTx 事务辅助
  users.ts    用户模型/昵称净化/slug/角色权限 + 数据访问
  pwd.ts      scrypt 密码哈希（含 dummy 校验防侧信道）
  sessions.ts 会话与 API token（SHA-256 存储）
  paths.ts    数据根/用户/实例目录布局
  port.ts     PortAllocator（4000–4999，DB+探活双保险）
  instances.ts 实例 CRUD（配额事务化/目录/trusted_host）
  supervisor.ts 实例监督器（spawn/探活/停止/锁/日志轮转/孤儿回收）
  api.ts      路由表（声明式 {auth, csrf} 选项）+ handler
  index.ts    入口
spikes/     M0 技术验证脚本（S1–S5，零依赖可独立运行）
scripts/    冒烟测试与安全回归（bash + curl，零依赖）
data/       运行时数据（SQLite WAL + 用户目录；gitignore）
```

## 运行

```bash
npm install          # 仅 devDependencies；运行时零依赖
npm run dev          # 监听 127.0.0.1:3082（DSH_HUB_PORT 可改；约定避开 3080/3081）
npm run typecheck    # npx tsc --noEmit
```

环境变量：`DSH_HUB_DATA`（默认 `<dsh-hub>/data`）、`DSH_HUB_HOST`、`DSH_HUB_PORT`、
`DSH_HUB_COOKIE_SECURE=1`（Caddy TLS 后启用）、`DSH_BIN`、`DSH_HUB_DOMAIN`（默认 `dshhub.local`）、`DSH_HUB_TRUST_PROXY=1`。

## 端点速查

| 端点 | 说明 |
|---|---|
| `POST /api/auth/setup` | 首启向导（仅无用户时；建管理员） |
| `POST /api/auth/register\|login\|logout` | 注册（受开关与限速控制）/登录/登出 |
| `GET /api/me` | 自己信息 + 配额 |
| `GET/POST /api/me/tokens` · `POST .../:id/revoke` | API token 双轨（Bearer，可吊销） |
| `GET/POST /api/instances` | 列出/新建实例（版本受白名单约束） |
| `GET /api/instances/:id` · `.../logs?tail=` | 实例详情/日志尾部（≤64KiB 读取） |
| `POST .../start\|stop\|restart` · `DELETE .../:id` | 生命周期（per-instance 互斥，并发 409 `instance_busy`） |
| `GET/POST /admin/api/users` · `PATCH .../:id` | 用户管理（封禁=停实例+吊销凭据；不可改自己 status/role） |
| `GET /admin/api/instances` | 跨用户实例总览 |
| `GET /admin/api/audit?limit=` | 审计 |
| `GET/PUT /admin/api/settings` | 注册开关 / 默认与白名单版本（`default_harness_version`、`allowed_harness_versions`） |
| `GET /healthz` | 探活 |

会话鉴权的写操作需 `X-CSRF-Token` 头（值与 `dshhub_csrf` cookie 一致）；Bearer 免 CSRF。
M2.1 起新增错误码：`invalid_harness_version` / `harness_version_not_allowed` / `instance_busy` / `invalid_nickname`。

## 测试

```bash
bash scripts/m1-smoke.sh            # 24 项认证冒烟（自带启动 hub，全新临时库）
bash scripts/m1-first-root.sh       # 首位注册自动 root 专项
bash scripts/m2-smoke.sh            # 29 项实例生命周期（真实 dsh web 实例）
bash scripts/security-regression.sh # 38 项安全回归（封禁链路/版本注入/并发配额/崩溃同步等）
```

## Spike 运行方式

```bash
npm run spike:s1   # dsh web 经 Node 反代（含 WS）可达性
npm run spike:s2   # --trusted-host 匹配规则静态分析
npm run spike:s3   # systemd-run 资源限额可行性
npm run spike:s4   # npx 固定版本冷启动（需外网可达 npm registry）
npm run spike:s5   # 中文昵称目录 ext4 行为
```

> Spike 一律避开 3080/3081（主实例与现有 GUI 占用），默认使用 3971/3972。
