# 技术方案：会员系统与订单管理

## 架构决策

### 决策 1：会员状态存储

**选择**：在 `users` 表冗余 `membership_type`、`membership_expires_at`、`trial_used` 字段

**理由**：
- 高频查询（每次登录、每次访问都需检查）
- 避免每次 JOIN `memberships` 表
- `memberships` 表作为完整记录留存（审计、订单）

### 决策 2：定时任务实现

**选择**：使用 `setInterval` 在 Hub 进程内定时校验（每日 0 点）

**理由**：
- 零依赖（不引入 cron 库）
- 单进程架构，无需外部调度
- 进程重启后自动重新注册

**备选**：系统 crontab 调用 CLI 命令（更健壮，但增加运维复杂度）

### 决策 3：支付接口预留

**选择**：订单创建即视为会员生效，`status` 默认 `paid`

**理由**：
- 当前不实现真实支付
- 订单创建成功 = 会员身份生效
- 后续接入支付时，改为 `status=pending` → 支付回调 → `status=paid`

### 决策 4：体验会员限制

**选择**：在 `users` 表记录 `trial_used` 布尔值

**理由**：
- 简单直接，一次查询即可判断
- 避免查询 `orders` 表历史

## 数据库设计

### 迁移版本

当前 schema 版本：`3`  
新增迁移版本：`4`（会员系统）

### users 表新增字段（Migration v4）

```sql
ALTER TABLE users ADD COLUMN membership_type TEXT CHECK(membership_type IN ('trial','monthly','yearly'));
-- 'trial' | 'monthly' | 'yearly' | NULL

ALTER TABLE users ADD COLUMN membership_expires_at INTEGER;
-- Unix timestamp (ms)，NULL 表示无会员

ALTER TABLE users ADD COLUMN trial_used INTEGER NOT NULL DEFAULT 0 CHECK(trial_used IN (0,1));
-- 0=未体验，1=已体验
```

### memberships 表（会员记录）

```sql
CREATE TABLE memberships (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('trial','monthly','yearly')),
  starts_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_expires_at ON memberships(expires_at);
```

### orders 表（订单记录）

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_type TEXT NOT NULL CHECK(membership_type IN ('trial','monthly','yearly')),
  amount REAL NOT NULL CHECK(amount >= 0),
  status TEXT NOT NULL CHECK(status IN ('pending','paid','cancelled','refunded')),
  payment_method TEXT,
  payment_id TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

### 套餐价格常量（后端硬编码）

```typescript
const MEMBERSHIP_PRICES: Record<MembershipType, number> = {
  trial: 0,
  monthly: 19.9,
  yearly: 198,
};

const MEMBERSHIP_DURATIONS: Record<MembershipType, number> = {
  trial: 24 * 60 * 60 * 1000,           // 1 天
  monthly: 30 * 24 * 60 * 60 * 1000,    // 30 天
  yearly: 365 * 24 * 60 * 60 * 1000,    // 365 天
};
```

## API 设计

### 用户端 API

| 方法 | 路径 | 鉴权 | CSRF | 说明 |
|---|---|---|---|---|
| GET | `/api/membership/plans` | session/bearer | 否 | 获取会员套餐列表 |
| POST | `/api/membership/purchase` | session | 是 | 购买会员（创建订单） |
| GET | `/api/me/membership` | session/bearer | 否 | 获取当前会员状态 |
| GET | `/api/me/orders` | session/bearer | 否 | 获取个人订单列表（分页） |

### 管理员 API

| 方法 | 路径 | 鉴权 | CSRF | 说明 |
|---|---|---|---|---|
| GET | `/admin/api/orders` | session/bearer (admin/root) | 否 | 获取所有订单（分页） |
| PATCH | `/admin/api/users/:id/membership` | session (admin/root) | 是 | 手动设置用户会员身份 |

### 页面路由

| 路径 | 鉴权 | 说明 |
|---|---|---|
| `/membership` | session | 会员购买页面（非会员自动重定向） |
| `/me/orders` | session | 个人订单页面 |
| `/admin/orders` | session (admin/root) | 管理员订单管理页面 |

## 关键流程

### 注册流程（修改）

```
用户注册 → 创建用户记录（membership_type=NULL, trial_used=0）
  → 登录 → 检查会员状态
    ├─ 有有效会员 → 进入控制台（原有流程）
    └─ 无会员 → 重定向到 /membership
```

**注意**：注册时不创建 DSH 实例，实例在首次购买会员后创建。

### 购买流程

```
选择套餐 → POST /api/membership/purchase
  ├─ 体验会员：
  │   ├─ 检查 trial_used=0 → 否则拒绝
  │   ├─ 创建订单（amount=0, status=paid）
  │   ├─ 标记 trial_used=1
  │   └─ 激活会员（type=trial, expires_at=now()+24h）
  │
  ├─ 月付/年付：
  │   ├─ 创建订单（amount=价格，status=paid）
  │   └─ 激活会员（type=monthly/yearly, expires_at=now()+30/365 天）
  │
  └─ 更新 users 表 membership_type + membership_expires_at
  └─ 若用户无 DSH 实例 → 自动创建
  └─ 重定向到 /instances
```

### 定时校验流程（每日 0 点）

```
遍历 users 表 WHERE membership_expires_at IS NOT NULL AND membership_expires_at < now()
  → 设置 membership_type=NULL, membership_expires_at=NULL
  → 记录日志（过期用户数）
```

### 登录流程（修改）

```
用户登录 → 检查 membership_type + membership_expires_at
  ├─ 有效会员（expires_at >= now()）→ 正常进入控制台
  ├─ 会员过期（expires_at < now()）→ 清除会员字段，重定向到 /membership
  └─ 从未购买（membership_type=NULL）→ 重定向到 /membership
```

### 实例访问网关（修改）

```
用户访问 /i/{user}-{instance}
  → 鉴权通过
  → 检查会员状态
    ├─ 有效会员 → 正常代理
    └─ 无会员/过期 → 重定向到 /membership
```

## 安全性考虑

1. **会员校验中间件**：所有实例相关 API 需检查会员状态
2. **订单金额校验**：后端硬编码套餐价格，不接受前端传入金额
3. **体验会员限制**：后端校验 `trial_used`，防止重复领取
4. **管理员权限**：订单管理和会员设置仅限 admin/root 角色
5. **CSRF 保护**：所有 POST/PATCH 写操作需 CSRF token
6. **并发购买**：使用 `withTx` 事务防止重复订单

## 边界情况处理

| 场景 | 处理方式 |
|---|---|
| 会员到期瞬间访问实例 | 网关检查 `expires_at >= now()`，过期即拒绝 |
| 定时任务未执行（进程宕机） | 登录时也会检查并清除过期会员 |
| 用户同时发起多个购买请求 | `withTx` 事务 + 订单创建前检查会员状态 |
| 管理员手动设置会员到期时间 | 允许任意时间，但需记录审计日志 |
| 体验会员过期后想再体验 | `trial_used=1` 永久标记，不可重置（除非管理员手动） |
| 订单创建失败（并发） | 事务回滚，返回错误信息 |
| 会员到期后仍有运行中实例 | 定时任务停止所有实例（或保留到自然停止） |
