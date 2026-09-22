# 会员到期后台定时处理规范

## 定时任务

### 到期扫描

Given 定时任务每小时执行一次

When 扫描 `users` 表中 `membership_expires_at` 已过期且 `membership_type IS NOT NULL` 的用户

Then 对每个到期用户执行：
1. 停止其所有 running 状态的实例
2. 将会员状态标记为过期（`membership_type = NULL` 或新增 `membership_status` 字段）
3. 发送到期通知邮件

### 到期提醒

Given 定时任务每小时执行一次

When 扫描 `membership_expires_at` 在未来 3 天内的用户

Then 发送到期提醒邮件（每个用户每 24 小时最多发送一次，避免重复通知）。

## 与请求时检查的关系

- 定时任务是主要检查机制
- 请求时的 `checkMembershipExpiry` 保留作为兜底，防止定时任务异常时会员状态不一致
- 两者操作幂等：重复执行不产生副作用

## 配置

| 配置项 | 默认值 | 说明 |
|---|---|---|
| 扫描间隔 | 3600000ms（1 小时） | 可通过环境变量 `EXPIRY_CHECK_INTERVAL_MS` 覆盖 |
| 提醒提前量 | 259200000ms（3 天） | 到期前 3 天发送提醒 |
| 数据保留期 | 604800000ms（7 天） | 到期后实例数据保留 7 天 |
