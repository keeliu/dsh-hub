# 会员到期后台定时处理实施清单

- [ ] 1.1 新增 `src/scheduler.ts`：`startScheduler()` / `stop()` / `processExpiries()`
- [ ] 1.2 `scheduler.ts` 实现到期扫描（停止实例 + 更新状态 + 发邮件）
- [ ] 1.3 `scheduler.ts` 实现到期提醒扫描（提前 3 天）
- [ ] 1.4 `config.ts` 新增 `getExpiryCheckInterval()` 配置函数
- [ ] 2.1 `index.ts` 启动时调用 `startScheduler(db)`
- [ ] 2.2 `index.ts` 优雅关闭时调用 `scheduler.stop()`
- [ ] 2.3 `email.ts` 新增到期通知邮件和提醒邮件模板
- [ ] 3.1 保留 `membership.ts` 中 `checkMembershipExpiry` 作为兜底
- [ ] 4.1 类型检查通过（`tsc --noEmit`）
