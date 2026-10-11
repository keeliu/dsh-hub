# 任务清单：实例启动异步化与停止握手

## 1. 异步启动

- [x] `spawn.ts::startInstance` 快路径（树就绪）保持同步
- [x] 慢路径：状态置 `starting` 并立即返回 `{ status: 'starting' }`
- [x] 后台执行「装树 → spawn → 探活」，成功 `running` / 失败 `failIfStillStarting`
- [x] 前端自动刷新：确认 `views/layout.ts:1098 statusAutoRefreshScript()` 已覆盖 `starting`
- [x] 版本合法性/配额校验留在请求路径（非法版本立刻 502，不异步化）

## 2. 在途登记与接力

- [x] `prep-guard.ts`：`trackPrep` / `getPrep`（settle 即摘除）
- [x] `instances.ts::createInstance` 的 fire-and-forget 装树纳入登记
- [x] 启动路径 `await getPrep(id)` 接力，不并发装两棵

## 3. 取消握手

- [x] `prep-guard.ts`：`markStart` / `unmarkStart` / `isStartInFlight` / `cancelStart` / `isStartCancelled`
- [x] `stop.ts`：启动在途先 `cancelStart`，再 `transitionStatus('stopping')`
- [x] `spawn.ts` 检查点 A（装树后）/ B（加锁后）/ C（写入 pid 后）三处查取消
- [x] 检查点 C 回收进程：`stopProcessGroup` + `clearPidfile` + `pid = NULL`

## 4. 状态机

- [x] `VALID_TRANSITIONS` 增加 `starting → stopping`、`failed → stopping`
- [x] 注释说明原因（异步启动 + stop 复用 restart/delete）

## 5. 停止可靠性

- [x] `stop.ts` 转换到 stopping 后重新从 DB 读 pid 再杀

## 6. 验证

- [x] `npx tsc -p . --noEmit` 通过（EXIT=0）
- [ ] `security-regression` 全绿（重点 B4：starting 期间停止必须 200）
- [ ] `m1-smoke` 24/24（已过：22:45:31 EXIT=0）
- [ ] `m2-smoke` 29/29
- [ ] `version-policy-regression` / `version-tree-regression` / `page-admin-regression` / `ui-audit`
- [ ] 手工验证：装树中 stop → 不复活（`pid` 为空、端口不监听）

## 7. 规范文档

- [x] `openspec/changes/async-instance-start/proposal.md`
- [x] `openspec/changes/async-instance-start/specs/acceptance.md`
- [x] `openspec/changes/async-instance-start/design.md`
- [x] `openspec/changes/async-instance-start/tasks.md`
- [ ] `openspec/specs/instances.md` 状态机描述同步（`starting → stopping` 合法）
