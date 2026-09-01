# 实施清单：会员系统与订单管理

## 阶段 1：数据库迁移（Migration v4）

- [ ] 在 `db.ts` 的 `MIGRATIONS` 数组中添加 version 4 迁移
- [ ] `users` 表新增 `membership_type` 字段（CHECK 约束）
- [ ] `users` 表新增 `membership_expires_at` 字段
- [ ] `users` 表新增 `trial_used` 字段（DEFAULT 0, CHECK 0/1）
- [ ] 创建 `memberships` 表（含外键、索引）
- [ ] 创建 `orders` 表（含外键、索引）
- [ ] 更新 `inferSchemaVersion()` 函数（检测新表）

## 阶段 2：类型定义与常量

- [ ] 定义 `MembershipType` 类型（`'trial' | 'monthly' | 'yearly'`）
- [ ] 定义 `OrderStatus` 类型（`'pending' | 'paid' | 'cancelled' | 'refunded'`）
- [ ] 定义 `MEMBERSHIP_PRICES` 常量（后端硬编码）
- [ ] 定义 `MEMBERSHIP_DURATIONS` 常量（毫秒）
- [ ] 定义 `Membership` 接口（数据库行类型）
- [ ] 定义 `Order` 接口（数据库行类型）

## 阶段 3：会员核心逻辑（`membership.ts`）

- [ ] 实现 `checkMembership(userId)` — 返回会员状态
- [ ] 实现 `activateMembership(db, userId, type)` — 激活会员
- [ ] 实现 `expireMembership(db, userId)` — 清除会员
- [ ] 实现 `canUseTrial(userId)` — 检查是否可体验
- [ ] 实现 `markTrialUsed(db, userId)` — 标记已体验
- [ ] 实现 `checkMembershipExpiry(db)` — 定时校验到期

## 阶段 4：订单逻辑（`orders.ts`）

- [ ] 实现 `createOrder(db, userId, type)` — 创建订单
- [ ] 实现 `getOrdersByUser(db, userId, page, limit)` — 个人订单
- [ ] 实现 `getAllOrders(db, page, limit)` — 管理员订单
- [ ] 实现 `getOrderById(db, orderId)` — 订单详情

## 阶段 5：API 路由

- [ ] `GET /api/membership/plans` — 获取套餐列表
- [ ] `POST /api/membership/purchase` — 购买会员（含 CSRF）
- [ ] `GET /api/me/membership` — 获取当前会员状态
- [ ] `GET /api/me/orders` — 获取个人订单（分页）
- [ ] `GET /admin/api/orders` — 管理员订单列表（分页）
- [ ] `PATCH /admin/api/users/:id/membership` — 手动设置会员（含 CSRF）

## 阶段 6：定时任务

- [ ] 在 `index.ts` 中实现 `scheduleMembershipExpiryCheck()` 函数
- [ ] 计算距离下一个 0 点的毫秒数
- [ ] 使用 `setInterval` 注册每日 0 点任务
- [ ] 添加日志输出（校验结果统计）
- [ ] 进程启动时立即执行一次校验（防止漏检）

## 阶段 7：页面与视图

- [ ] 创建 `views/membership.ts` — 购买页面视图
- [ ] 创建 `views/orders.ts` — 订单列表视图（复用）
- [ ] 修改 `pages.ts` 添加 `/membership` 路由
- [ ] 修改 `pages.ts` 添加 `/me/orders` 路由
- [ ] 修改 `pages.ts` 添加 `/admin/orders` 路由
- [ ] 修改登录流程（检查会员状态并重定向）
- [ ] 修改注册流程（跳过实例创建）
- [ ] 修改 `gateway.ts`（实例访问检查会员状态）

## 阶段 8：管理员功能

- [ ] 用户管理页面显示会员标识（`membership_type` + 到期时间）
- [ ] 创建用户时可选会员身份（下拉框）
- [ ] 订单管理页面（表格 + 分页 + 筛选）
- [ ] 手动设置会员身份对话框（类型 + 到期时间）

## 阶段 9：测试与验证

- [ ] 注册新用户 → 重定向到购买页面
- [ ] 购买体验会员 → 实例自动创建 → 进入控制台
- [ ] 体验会员过期 → 重定向到购买页面 → 不可再选体验
- [ ] 购买月付/年付 → 实例可用 → 到期后失效
- [ ] 定时任务校验 → 过期用户会员标识清除
- [ ] 管理员查看订单 → 手动设置会员身份
- [ ] 用户个人中心 → 查看订单 → 续费入口
- [ ] 非会员访问实例 → 重定向到购买页面
- [ ] 并发购买测试 → 事务保护生效

## 依赖关系

```
阶段 1（数据库迁移）
  ↓
阶段 2（类型定义）
  ↓
阶段 3（会员逻辑） → 阶段 4（订单逻辑）
  ↓                    ↓
阶段 5（API 路由） ←──┘
  ↓
阶段 6（定时任务）
  ↓
阶段 7（页面视图）
  ↓
阶段 8（管理员功能）
  ↓
阶段 9（测试验证）
```

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `src/db.ts` | 修改 | 添加 Migration v4 |
| `src/membership.ts` | 新增 | 会员核心逻辑 |
| `src/orders.ts` | 新增 | 订单逻辑 |
| `src/api.ts` | 修改 | 添加会员/订单 API 路由 |
| `src/pages.ts` | 修改 | 添加会员/订单页面路由 |
| `src/gateway.ts` | 修改 | 实例访问检查会员状态 |
| `src/index.ts` | 修改 | 注册定时任务 |
| `src/views/membership.ts` | 新增 | 购买页面视图 |
| `src/views/orders.ts` | 新增 | 订单列表视图 |
| `src/views/user.ts` | 修改 | 个人中心添加订单入口 |
| `src/views/admin.ts` | 修改 | 管理员添加订单管理 |
