# 会员到期后台定时处理技术方案

## 架构

```
index.ts (启动)
  │
  ├── startServer()
  │
  └── startScheduler(db)
        │
        ── setInterval(3600000ms)
              │
              ├── scanExpiringMemberships()  → 停止实例 + 更新状态 + 发邮件
              ── scanExpiringSoonMemberships() → 发送提醒邮件
```

## scheduler.ts 设计

```typescript
export interface Scheduler {
  stop(): void;
}

export function startScheduler(db: DatabaseSync): Scheduler {
  const interval = setInterval(() => {
    processExpiries(db);
  }, getExpiryCheckInterval());

  return {
    stop() { clearInterval(interval); }
  };
}

function processExpiries(db: DatabaseSync): void {
  const now = Date.now();
  const reminderThreshold = now + 3 * 24 * 3600 * 1000;

  // 1. 已到期：停止实例 + 更新状态
  const expired = db.prepare(
    `SELECT id, nickname, email FROM users
     WHERE membership_expires_at IS NOT NULL
       AND membership_expires_at <= ?
       AND membership_type IS NOT NULL`
  ).all(now) as UserRow[];

  for (const user of expired) {
    stopUserInstances(db, user.id);
    // 更新会员状态（保留历史，不清除 membership_expires_at）
    db.prepare("UPDATE users SET membership_type = NULL WHERE id = ?").run(user.id);
    sendExpiryEmail(user);
  }

  // 2. 即将到期：发送提醒
  const expiringSoon = db.prepare(
    `SELECT id, nickname, email FROM users
     WHERE membership_expires_at IS NOT NULL
       AND membership_expires_at > ?
       AND membership_expires_at <= ?
       AND membership_type IS NOT NULL`
  ).all(now, reminderThreshold) as UserRow[];

  for (const user of expiringSoon) {
    sendReminderEmail(user);
  }
}
```

## 优雅关闭

`index.ts` 的 `gracefulShutdown` 中调用 `scheduler.stop()`，确保进程退出时清除定时器。

## 风险

- 定时任务执行期间如果进程崩溃，下次启动时会重新扫描，操作幂等所以安全
- 邮件发送失败不阻塞其他用户处理（每个用户独立 try/catch）
- 扫描查询需要 `membership_expires_at` 索引（已有）
