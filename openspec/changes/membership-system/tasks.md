# 实施清单：会员系统与订单管理

## 阶段 1：数据库与模型

- [ ] 创建 `memberships` 表迁移
- [ ] 创建 `orders` 表迁移
- [ ] `users` 表新增 `membership_type`、`membership_expires_at`、`trial_used` 字段
- [ ] 定义 `MembershipType` 类型（`'trial' | 'monthly' | 'yearly'`）
- [ ] 定义 `OrderStatus` 类型（`'pending' | 'paid' | 'cancelled'`）

## 阶段 2：会员核心逻辑

- [ ] 实现 `checkMembership(userId)` 函数
- [ ] 实现 `activateMembership(userId, type, durationMs)` 函数
- [ ] 实现 `expireMembership(userId)` 函数
- [ ] 实现 `canUseTrial(userId)` 函数（检查 trial_used）
- [ ] 实现 `markTrialUsed(userId)` 函数

## 阶段 3：订单逻辑

- [ ] 实现 `createOrder(userId, membershipType)` 函数
- [ ] 实现 `getOrdersByUser(userId)` 函数
- [ ] 实现 `getAllOrders(page, limit)` 函数（管理员）
- [ ] 定义套餐价格常量（`MEMBERSHIP_PRICES`）

## 阶段 4：API 路由

- [ ] `GET /api/membership/plans` — 获取套餐列表
- [ ] `POST /api/membership/purchase` — 购买会员
- [ ] `GET /api/me/membership` — 获取当前会员状态
- [ ] `GET /api/me/orders` — 获取个人订单
- [ ] `GET /admin/api/orders` — 管理员订单列表
- [ ] `PATCH /admin/api/users/:id/membership` — 手动设置会员身份

## 阶段 5：定时任务

- [ ] 实现 `checkMembershipExpiry()` 函数
- [ ] 在 `index.ts` 中注册每日 0 点定时任务
- [ ] 添加日志输出（校验结果统计）

## 阶段 6：页面与视图

- [ ] 创建 `/membership` 购买页面视图
- [ ] 创建 `/me/orders` 个人订单页面视图
- [ ] 创建 `/admin/orders` 管理员订单页面视图
- [ ] 修改登录流程（检查会员状态并重定向）
- [ ] 修改注册流程（跳过实例创建）
- [ ] 修改实例访问网关（检查会员状态）

## 阶段 7：管理员功能

- [ ] 用户管理页面显示会员标识
- [ ] 创建用户时可选会员身份
- [ ] 订单管理页面（表格 + 分页）

## 阶段 8：测试与验证

- [ ] 注册新用户 → 重定向到购买页面
- [ ] 购买体验会员 → 实例自动创建 → 进入控制台
- [ ] 体验会员过期 → 重定向到购买页面 → 不可再选体验
- [ ] 购买月付/年付 → 实例可用 → 到期后失效
- [ ] 定时任务校验 → 过期用户会员标识清除
- [ ] 管理员查看订单 → 手动设置会员身份
- [ ] 用户个人中心 → 查看订单 → 续费入口

## 依赖关系

```
阶段 1（数据库）
  ↓
阶段 2（会员逻辑） → 阶段 3（订单逻辑）
  ↓                    ↓
阶段 4（API 路由） ←──┘
  ↓
阶段 5（定时任务）
  ↓
阶段 6（页面视图）
  ↓
阶段 7（管理员功能）
  ↓
阶段 8（测试验证）
```
