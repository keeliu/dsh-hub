# 验收规范：实例启动异步化与停止握手

## 场景 1：插件树已就绪 → 启动同步完成

- **Given** 实例 `harness_version` 为空（或等于镜像内置版本），且 `.plugins-installed` 标记与目标 dsh 版本一致
- **When** `POST /api/instances/:id/start`
- **Then** 请求内完成加锁 → spawn → 探活；响应 `instance.status` 为 `running`，`pid` 非空
- **And** 探活超时（180s）时响应 502 `start_failed`，实例状态 `failed`，并写入失败快照

## 场景 2：需要装树 → 异步返回 starting

- **Given** 实例首次以非内置版本启动（或 `.plugins-installed` 标记版本 ≠ 目标 dsh 版本）
- **When** `POST /api/instances/:id/start`
- **Then** 状态立即置为 `starting`，HTTP 200 返回 `{ status: "starting" }`，**不得**在请求内等待 npx 下载
- **And** 后台完成「装树 → spawn → 探活」，成功后状态变 `running`，失败变 `failed`
- **And** 前端实例列表/详情页在出现 `starting`/`stopping` 文案时每 3s 自动刷新

## 场景 3：建实例装树与启动接力（不并发装两遍）

- **Given** `createInstance` 已 fire-and-forget 开始装树（在途）
- **When** 用户立刻点「启动」
- **Then** 启动路径 `await` 该在途任务（`getPrep`），完成后重新读标记：标记已就绪则直接 spawn
- **And** 同一实例同时只允许一条装树流水线（`getPrep` settle 后即摘除，不再阻塞后续启动）

## 场景 4：starting 期间点停止 → 200，且不会被后台任务重新拉起

- **Given** 实例处于 `starting`（后台装树中）
- **When** `POST /api/instances/:id/stop`
- **Then** HTTP **200**（不得 500）；状态 `starting → stopping → stopped`
- **And** 后台任务看到取消标记后**不 spawn**；若已 spawn 则进程被回收、pidfile 被清理
- **And** 停止后 DB 状态为 `stopped` 且 `pid IS NULL`，端口不再可连

## 场景 5：failed 实例可停/可重启/可删除

- **Given** 实例处于 `failed`
- **When** `POST .../stop`、`POST .../restart`、`DELETE ...`
- **Then** 均不因「非法转换」报 500；`stop` 走 `failed → stopping → stopped`

## 场景 6：并发操作不产生 500

- **Given** 同一实例已有 `withInstanceOp` 在途操作
- **When** 并发再发 start/stop
- **Then** 后来的请求返回 **409 `instance_busy`**；两种操作都**不得**返回 500

## 场景 7：非法版本仍在请求路径被拒绝

- **Given** DB 里被直改成 `harness_version = 'file:/etc'`（模拟绕过 API 校验）
- **When** `POST .../start`
- **Then** 立即返回 **502 `start_failed`**（不得变成异步失败）、实例状态 `failed`、hub 仍存活

## 场景 8：异步启动失败不阻塞其他实例

- **Given** 两个实例同时启动，其中一个装树失败
- **When** 两者的后台任务分别结束
- **Then** 成功者 `running`、失败者 `failed`（有失败快照），互不影响
