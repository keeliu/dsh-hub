# 实施清单：会员系统与订单管理

## 阶段 1：数据库迁移（Migration v4）✅

- [x] 在 `db.ts` 的 `MIGRATIONS` 数组中添加 version 4 迁移
- [x] `users` 表新增 `membership_type` 字段（CHECK 约束）
- [x] `users` 表新增 `membership_expires_at` 字段
- [x] `users` 表新增 `trial_used` 字段（DEFAULT 0, CHECK 0/1）
- [x] 创建 `memberships` 表（含外键、索引）
- [x] 创建 `orders` 表（含外键、索引）
- [x] 更新 `inferSchemaVersion()` 函数（检测新表）

## 阶段 2：类型定义与常量 ✅

- [x] 定义 `MembershipType` 类型（`'trial' | 'monthly' | 'yearly'`）
- [x] 定义 `OrderStatus` 类型（`'pending' | 'paid' | 'cancelled' | 'refunded'`）
- [x] 定义 `MEMBERSHIP_CONFIG` 常量（含价格、时长、标签）
- [x] 定义 `MembershipRow` 接口（数据库行类型）
- [x] 定义 `OrderRow` 接口（数据库行类型）

## 阶段 3：会员核心逻辑（`membership.ts`）✅

- [x] 实现 `getUserMembership(userId)` — 返回会员状态
- [x] 实现 `activateMembership(db, userId, type)` — 激活会员
- [x] 实现 `expireMemberships(db)` — 批量清除过期会员
- [x] 实现 `hasActiveMembership(userId)` — 检查是否有有效会员
- [x] 实现 `adminSetMembership()` — 管理员手动设置会员
- [x] 会员激活后自动创建 DSH 实例（`ensureInstanceForUser`）

## 阶段 4：订单逻辑（合并到 `membership.ts`）✅

- [x] 实现 `createOrder(db, userId, type)` — 创建订单并立即激活
- [x] 实现 `getUserOrders(db, userId)` — 个人订单
- [x] 实现 `getAllOrders(db, limit, offset)` — 管理员订单
- [x] 实现 `getOrderById(db, orderId)` — 订单详情

## 阶段 5：页面路由（pages.ts）✅

- [x] `GET /membership` — 会员购买页面
- [x] `POST /membership/purchase` — 购买会员（含 CSRF）
- [x] `GET /profile` — 用户个人中心（含订单记录）
- [x] `GET /admin/membership` — 管理员订单管理页面
- [x] `POST /admin/users/:id/membership` — 管理员手动设置会员
- [x] 修改登录流程（检查会员状态，无会员重定向到购买页）
- [x] 修改注册流程（跳过实例创建，重定向到购买页）
- [x] 修改首页访问控制（无会员重定向到购买页）

## 阶段 6：定时任务 ✅

- [x] 创建 `scheduler.ts` — 定时任务调度器
- [x] 实现每日 0 点会员到期检查
- [x] 进程启动时立即执行一次校验
- [x] 在 `index.ts` 中集成调度器

## 阶段 7：页面视图 ✅

- [x] `views/user.ts` 添加 `renderMembershipPage()` — 购买页面
- [x] `views/user.ts` 添加 `renderProfilePage()` — 个人中心
- [x] `views/admin.ts` 添加 `renderAdminMembershipPage()` — 管理员订单管理
- [x] 管理后台侧边栏添加"会员管理"链接

## 阶段 8：管理员功能 ✅

- [x] 管理员可查看订单列表
- [x] 管理员可手动设置用户会员身份

## 阶段 9：测试与验证（待部署后验证）

- [ ] 注册新用户 → 重定向到购买页面
- [ ] 购买体验会员 → 实例自动创建 → 进入控制台
- [ ] 体验会员过期 → 重定向到购买页面 → 不可再选体验
- [ ] 购买月付/年付 → 实例可用 → 到期后失效
- [ ] 定时任务校验 → 过期用户会员标识清除
- [ ] 管理员查看订单 → 手动设置会员身份
- [ ] 用户个人中心 → 查看订单 → 续费入口
- [ ] 非会员访问实例 → 重定向到购买页面

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/db.ts` | 修改 | Migration v4 + AuditAction 扩展 |
| `src/membership.ts` | 新增 | 会员核心逻辑 + 订单逻辑 |
| `src/scheduler.ts` | 新增 | 定时任务调度器 |
| `src/instances.ts` | 修改 | 添加 `ensureInstanceForUser()` |
| `src/pages.ts` | 修改 | 会员页面路由 + 登录/注册流程调整 |
| `src/index.ts` | 修改 | 集成调度器 |
| `src/views/user.ts` | 修改 | 添加会员购买页、个人中心视图 |
| `src/views/admin.ts` | 修改 | 添加管理员会员管理视图 |

## 依赖关系

```
阶段 1（数据库迁移）✅
  ↓
阶段 2（类型定义）✅
  ↓
阶段 3（会员逻辑）✅ → 阶段 4（订单逻辑）✅
  ↓                      ↓
阶段 5（页面路由）✅ ←──┘
  ↓
阶段 6（定时任务）✅
  ↓
阶段 7（页面视图）✅
  ↓
阶段 8（管理员功能）✅
  ↓
阶段 9（测试验证）— 待部署后执行
```
