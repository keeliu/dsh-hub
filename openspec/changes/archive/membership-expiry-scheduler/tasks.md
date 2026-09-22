# 会员到期后台定时处理实施清单
> 归档对账（2026-09-22）：本变更已实现并归档；checkbox 按「实现完成」统一勾选，未在本环境复跑的验证项以历史状态为准。

- [x] 1.1 新增 `src/scheduler.ts`：`startScheduler()` / `stop()` / `processExpiries()`
- [x] 1.2 `scheduler.ts` 实现到期扫描（停止实例 + 更新状态 + 发邮件）
- [x] 1.3 `scheduler.ts` 实现到期提醒扫描（提前 3 天）
- [x] 1.4 `config.ts` 新增 `getExpiryCheckInterval()` 配置函数
- [x] 2.1 `index.ts` 启动时调用 `startScheduler(db)`
- [x] 2.2 `index.ts` 优雅关闭时调用 `scheduler.stop()`
- [x] 2.3 `email.ts` 新增到期通知邮件和提醒邮件模板
- [x] 3.1 保留 `membership.ts` 中 `checkMembershipExpiry` 作为兜底
- [x] 4.1 类型检查通过（`tsc --noEmit`）
