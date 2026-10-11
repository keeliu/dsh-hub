# 设计：实例启动异步化与停止握手

## 决策 1：慢路径异步、快路径同步（而不是全部异步）

装树（`npx --yes @deepseek-ai/dsh@<ver>` 首次下载数百 MB + `dsh plugin add` × 5 + node-gyp 编译）
实测数分钟到数十分钟，绝不可能放在 HTTP 请求里。但**已经装好树的二次启动**只需要几百毫秒，
若也异步化，`/api/instances/:id/start` 的成功/失败语义会被削弱（调用方必须轮询才能知道成没成），
而且 `security-regression` 等既有测试全都依赖「start 返回即 running」。

因此：**只有当真的需要装树时才异步**（`preparePluginTree` 判定树与目标版本不一致），
其余路径保持同步语义不变。

## 决策 2：状态机新增 `starting → stopping`，而不是让 stop 等启动结束

- 「等启动结束再停」把 stop 请求拖进 180s 探活 + 数十分钟装树里，用户点停止要等到天荒地老。
- 「禁止 starting 期间停止」是产品不可接受的（用户看到卡在 starting 一定想停）。
- 所以必须允许 `starting → stopping`：**停止是取消，不是等待**。

同理 `failed → stopping`：`stopInstance` 会被 `restart` 与 `DELETE` 复用，失败实例也必须能走到 stopping。

## 决策 3：用「取消标记」而不是「取消 token / AbortSignal」

装树流水线是外部进程（npx/pnpm），无法真正中断（强杀会留下半棵 node_modules，比不装更糟），
我们能控制的只有「**装完之后不要 spawn**」以及「**已经 spawn 了就回收**」。
所以取消语义实现为**幂等的标记查询**：

- `cancelStart(id)` 写入 `cancelledIds`；
- 后台流水线在三个检查点查询：①装树结束后（检查点 A，在后台 IIFE 内）
  ②`spawnAndProbe` 拿到实例锁之后（检查点 B）③进程已写入 pid/pidfile 之后（检查点 C）。

检查点 C 是关键：**A→spawn 之间始终存在窗口**（检查完到 fork 完成之间进程可能已经起来），
与其追求「不可能有窗口」，不如保证「窗口内的结果一定被回收」——
C 处发现取消就 `stopProcessGroup(pgid, 1000)` + `clearPidfile` + `pid = NULL`。
这样最坏情况是「进程活了 1 秒又被杀掉」，而不是「DB 说 stopped、进程一直在跑」的孤儿。

`markStart(id)` 在登记时**清掉 `cancelledIds`**：同一次启动取消后，用户再次点启动必须能正常走。

## 决策 4：stop 转换状态后重新读 pid

`stopInstance` 原先用进函数时读到的 `record.pid`。异步启动下这个值可能还是 `NULL`（进程随后才拉起），
于是 stop 会「转换到 stopping 但不杀进程」→ 后台任务被取消标记拦住不 spawn（正确），
但如果它**已经**处于检查点 C 之后（进程已起、pid 已写），stop 就会漏杀。
所以 `transitionStatus(...'stopping')` 之后重新 `SELECT pid FROM instances WHERE id = ?`，
`fresh?.pid ?? record.pid ?? readPidfile(record)`——读 DB 是权威，pidfile 只是兜底。

## 决策 5：失败标记只在「自己仍占有 starting」时才写

后台任务失败时若直接 `transitionStatus('failed')`，可能覆盖用户 stop 推进的 `stopping/stopped`
（甚至把已删除实例的状态改回来）。因此统一走 `failIfStillStarting(id, error)`：
只有当前状态仍是 `starting` 才标记失败。

## 竞态矩阵（异步启动 vs. 用户 / 其它操作）

| 时序 | 结果 |
| --- | --- |
| 装树中 → stop | cancel 标记 + `starting→stopping` 合法；后台在检查点 A/B 放弃 spawn |
| 装树结束 → 恰好 spawn 中 → stop | C 检查点回收进程；DB 状态由 stop 推进为 stopped、`pid = NULL` |
| 装树中 → delete | delete 先 stop（同上取消），行被删；后台后续 `currentStatus` 查不到行 → 放弃 |
| 装树中 → 并发 start | `withInstanceOp` 拦为 409 `instance_busy`（不排队，语义与既有实现一致） |
| 装树中 → hub 重启 | 启动时 `reclaimOrphaned` 回收：`running` 一律转 `stopped`（重启后一律需手动启动） |
| 装树中 → 再点 stop 一次 | cancel 幂等；第二次 stop 走 `stopping` 已在途的分支，不报错 |

## 不做什么

- **不改** `START_TIMEOUT_MS`(180s)/`STOP_GRACE_MS`(8s)/锁语义（`lockSecret` 校验、`pid` 不匹配即拒释放）。
- **不引入** 后台队列/worker 线程：装树本身就是外部子进程，用一个 `Set` + 标记足够，
  多引入一层反而增加状态不一致面。
- **不做** 启动进度百分比（`dsh plugin add` 不提供结构化进度，伪进度会误导）
  ——页面用「3s 自动刷新 + starting 徽章」表达「在跑」即可。
