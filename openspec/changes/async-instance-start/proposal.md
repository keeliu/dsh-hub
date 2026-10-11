# 变更提案：实例启动异步化与停止握手（async-instance-start）

## Why（为什么做）

**触发问题**：新建/首次以非内置版本启动一个实例时，`POST /api/instances/:id/start` 在**请求路径里同步执行**
`dsh plugin add`（`npx --yes @deepseek-ai/dsh@<ver>` 首次要下载数百 MB，实测数分钟到数十分钟）。
请求被前端 fetch / 反向代理的超时切断，用户看到「点了启动没反应 / 启动失败」；workspace loading 页的
60s 兜底也把仍在正常装树的实例误判为失败。

**并发踩踏**：`instances.ts::createInstance` 在模板不可用时 fire-and-forget 地装树（不能阻塞建实例请求）。
用户「建完实例立刻点启动」时，启动路径会对着**同一个 DSH_HOME** 再跑一遍 `dsh plugin add`，
两棵插件树互相覆盖，产出损坏的 profile。

**异步化暴露出的两个缺陷**（本变更同时修）：

1. 实例会**长时间停在 `starting`**（这正是异步的代价）。此时点「停止」→ `transitionStatus(stopping)`
   从 `starting` 出发**不在转换表里** → 抛错 → API 返回 **500**（安全回归 B4 复现：
   `[FAIL] B4 先停实例（并发准备） — expected 200 got 500`）。
2. 后台任务与 stop 竞争：后台任务在 stop 把状态推到 `stopping/stopped` 之后，仍可能走过自己的状态检查、
   进入 `spawnAndProbe`，把状态写回 `starting` 并**拉起一个没人管的进程**（DB 说 stopped、实际有实例在跑）。

## What Changes（做什么）

1. **启动异步化**（`dsh-hub/src/supervisor/spawn.ts::startInstance`）
   - **快路径**（插件树与目标 dsh 版本一致、无在途装树）：保持同步，加锁 → spawn → 探活 → 返回 `running/failed`。
   - **慢路径**（首次装树 / 按版本重建）：先把状态置 `starting` 并**立即返回** `{ status: 'starting' }`；
     装树 + spawn + 探活放到后台，前端由 `views/layout.ts::statusAutoRefreshScript()` 每 3s 自动刷新。
   - **版本合法性校验仍在请求路径**：非法 `harness_version` 必须立刻 502，不能退化成「异步失败」。
2. **在途登记与接力**（新增 `dsh-hub/src/supervisor/prep-guard.ts`）
   - `trackPrep(id, task)` / `getPrep(id)`：建实例的装树任务登记在案，**settle 即摘除**；启动路径发现同一实例
     有在途装树就接力 `await`，绝不并发再装一遍。
   - `markStart` / `unmarkStart` / `isStartInFlight` / `cancelStart` / `isStartCancelled`：
     「整个启动流程在途」标记 + **取消握手**（见 What Changes 4/5）。
3. **状态机**（`dsh-hub/src/supervisor/index.ts::VALID_TRANSITIONS`）
   - 新增 `starting → stopping`：实例还在装树时用户点停止是合法操作。
   - 新增 `failed → stopping`：覆盖「失败实例再停/重启/删除」（`restart`、`DELETE` 都会先调 `stopInstance`）。
4. **`stopInstance`**（`dsh-hub/src/supervisor/stop.ts`）
   - 若 `isStartInFlight(id)` → 先 `cancelStart(id)` 再转换状态，后台任务因此不会把实例拉起来。
   - 转换到 `stopping` 之后**重新从 DB 读一次 pid**（异步启动可能刚把进程拉起并写入 pid/pidfile），
     否则会漏杀刚启动的进程、留下孤儿。
5. **后台任务的取消检查**（`spawn.ts::spawnAndProbe`）
   - 加锁后立刻查一次取消标记：已取消 → 释放锁、直接返回 failed（不 spawn）。
   - **spawn 之后立刻再查一次**：已取消 → `stopProcessGroup` 回收刚拉起的进程、清 pidfile，
     状态交给 stop 路径推进。这把「检查 → spawn」之间的窗口收到最小，杜绝孤儿进程。
6. **失败标记乐观化**（沿用）：后台任务失败时只在自己仍处于 `starting` 时才标记 `failed`
   （`failIfStillStarting`），不覆盖 stop/delete 推进的状态。

## Impact（影响范围）

- **受影响文件**：`dsh-hub/src/supervisor/spawn.ts`、`stop.ts`、`index.ts`、新增 `prep-guard.ts`；
  `dsh-hub/src/instances.ts`（`createInstance` 用 `trackPrep` 登记装树）。
- **API 语义**：`POST /api/instances/:id/start` 现在可能返回 `status: "starting"`（HTTP 200），
  调用方需轮询 `GET /api/instances/:id` 直到 `running/failed`；页面已由 `statusAutoRefreshScript()` 自动刷新。
- **状态机**：转换表新增两条边（见上）；`openspec/specs/instances.md` 的状态说明同步。
- **风险等级**：中。核心是并发/竞态，已用取消握手把窗口最小化，并有安全回归 B4、B1、B2 覆盖。
- **不改变**：实例锁（`lock.ts`）语义、`withInstanceOp` 的 409 `instance_busy` 语义、探活超时
  （`START_TIMEOUT_MS=180s`）、停止宽限（`STOP_GRACE_MS=8s`）、配额与版本白名单策略。
