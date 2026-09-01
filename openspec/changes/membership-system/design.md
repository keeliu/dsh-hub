# 技术方案：会员系统与订单管理

## 架构决策

### 决策 1：会员状态存储

**选择**：在 `users` 表冗余 `membership_type` 和 `membership_expires_at` 字段

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

**选择**：定义 `createOrder()` 接口，支付状态默认为 `paid`（模拟成功）

**理由**：
- 当前不实现真实支付
- 接口签名与未来支付集成兼容
- 前端流程完整，后端易替换

### 决策 4：体验会员限制

**选择**：在 `users` 表记录 `trial_used` 布尔值

**理由**：
- 简单直接，一次查询即可判断
- 避免查询 `orders` 表历史

## 数据库设计

### users 表新增字段

```sql
ALTER TABLE users ADD COLUMN membership_type TEXT DEFAULT NULL;
-- 'trial' | 'monthly' | 'yearly' | NULL

ALTER TABLE users ADD COLUMN membership_expires_at INTEGER DEFAULT NULL;
-- Unix timestamp (ms)

ALTER TABLE users ADD COLUMN trial_used INTEGER DEFAULT 0;
-- 0 | 1
```

### memberships 表（会员记录）

```sql
CREATE TABLE memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,           -- 'trial' | 'monthly' | 'yearly'
  starts_at INTEGER NOT NULL,   -- Unix timestamp (ms)
  expires_at INTEGER NOT NULL,  -- Unix timestamp (ms)
  order_id INTEGER,             -- 关联订单
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

### orders 表（订单记录）

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  membership_type TEXT NOT NULL,  -- 'trial' | 'monthly' | 'yearly'
  amount REAL NOT NULL,           -- 金额（元）
  status TEXT NOT NULL,           -- 'pending' | 'paid' | 'cancelled'
  payment_method TEXT,            -- 预留：'alipay' | 'wechat' | 'stripe'
  payment_id TEXT,                -- 预留：第三方支付流水号
  created_at INTEGER NOT NULL,
  paid_at INTEGER,                -- 支付时间
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## API 设计

### 用户端 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/membership/plans` | 获取会员套餐列表 |
| POST | `/api/membership/purchase` | 购买会员（创建订单） |
| GET | `/api/me/membership` | 获取当前会员状态 |
| GET | `/api/me/orders` | 获取个人订单列表 |

### 管理员 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/admin/api/orders` | 获取所有订单（分页） |
| PATCH | `/admin/api/users/:id/membership` | 手动设置用户会员身份 |

### 页面路由

| 路径 | 说明 |
|---|---|
| `/membership` | 会员购买页面（非会员自动重定向） |
| `/me/orders` | 个人订单页面 |
| `/admin/orders` | 管理员订单管理页面 |

## 关键流程

### 注册流程（修改）

```
用户注册 → 创建用户记录（membership_type=NULL）→ 登录 → 检查会员状态
  ├─ 有有效会员 → 进入控制台（原有流程）
  └─ 无会员 → 重定向到 /membership
```

### 购买流程

```
选择套餐 → POST /api/membership/purchase
  ├─ 体验会员：检查 trial_used=0 → 创建订单（amount=0）→ 标记 trial_used=1
  ├─ 月付/年付：创建订单（status=paid，模拟支付）
  └─ 更新 users 表 membership_type + membership_expires_at
  └─ 创建 DSH 实例（首次购买时）
  └─ 重定向到 /instances
```

### 定时校验流程（每日 0 点）

```
遍历 users 表 WHERE membership_expires_at IS NOT NULL
  ├─ membership_expires_at < now() → 设置 membership_type=NULL
  └─ membership_expires_at >= now() → 保持
```

### 登录流程（修改）

```
用户登录 → 检查 membership_type + membership_expires_at
  ├─ 有效会员 → 正常进入控制台
  ├─ 会员过期 → 清除 membership_type，重定向到 /membership
  └─ 从未购买 → 重定向到 /membership
```

## 安全性考虑

1. **会员校验中间件**：所有实例相关 API 需检查会员状态
2. **订单金额校验**：后端硬编码套餐价格，不接受前端传入
3. **体验会员限制**：后端校验 `trial_used`，防止重复领取
4. **管理员权限**：订单管理和会员设置仅限 admin/root 角色
