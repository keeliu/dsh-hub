# DSH Hub

多人使用的 DeepSeek Harness（dsh）多实例管理器：单台 Linux 服务器，网页登录，
每用户一个昵称目录，实例与数据严格隔离，管理员后台统一管理。

- 调研依据：`../docs/01-调研笔记.md`
- 开发计划：`../docs/02-开发计划.md`
- Spike 验证记录：`../docs/03-Spike验证记录.md`

## 目录

```
src/       控制面（TypeScript）：db/ pwd/ users/ sessions/ api/ index
spikes/    M0 技术验证脚本（零依赖，可独立运行）
scripts/   M1 冒烟测试（bash + curl，零依赖）
data/      运行时数据（SQLite WAL，已 gitignore）
```

## 运行控制面（M1：认证与用户体系）

```bash
npm install          # 仅安装 devDependencies（typescript/@types/node）；运行时零依赖
npm run dev          # 监听 127.0.0.1:3082（DSH_HUB_PORT 可改；约定避开 3080/3081）
```

环境变量：`DSH_HUB_DATA`（默认 `<dsh-hub>/data`）、`DSH_HUB_HOST`、`DSH_HUB_PORT`、`DSH_HUB_COOKIE_SECURE=1`（Caddy TLS 后启用）。

端点速查：`POST /api/auth/setup`（首启向导）｜`POST /api/auth/register|login|logout`｜`GET /api/me`｜`POST /api/me/tokens`｜`GET/POST /api/instances`｜`POST /api/instances/:id/start|stop|restart`｜`DELETE /api/instances/:id`｜`GET /api/instances/:id/logs?tail=`｜`GET /admin/api/users`｜`PATCH /admin/api/users/:id`｜`GET /admin/api/instances`（跨用户）｜`GET /admin/api/audit`｜`GET/PUT /admin/api/settings`｜`/healthz`。

测试：

```bash
bash scripts/m1-smoke.sh http://127.0.0.1:3082   # M1 认证冒烟（24 项，全新库跑）
bash scripts/m1-first-root.sh                    # 首位注册自动 root（全新库+预置开放注册）
bash scripts/m2-smoke.sh                         # M2 实例生命周期冒烟（29 项，真实 dsh web）
```

实例目录（`data/users/<昵称>/instances/<id>/`）：`home`（=DSH_HOME）、`workspace`、`logs`（web.out.log + 失败快照）、`instance.pid` + `.dsh-instance.lock`。实例端口 4000–4999，trusted_host 为 `<slug>-<实例ID>.dshhub.local`（M3 网关再接入）。

## Spike 运行方式

```bash
pnpm run spike:s1   # dsh web 经 Node 反代（含 WS）可达性
pnpm run spike:s2   # --trusted-host 匹配规则静态分析
pnpm run spike:s3   # systemd-run 资源限额可行性
pnpm run spike:s4   # npx 固定版本冷启动（需外网）
pnpm run spike:s5   # 中文昵称目录 ext4 行为
```

> Spike 一律避开 3080/3081（主实例与现有 GUI 占用），默认使用 3971/3972。
