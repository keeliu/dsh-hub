# 功能规范：会员系统与订单管理

## 场景 1：新用户注册后进入购买页面

**Given** 用户完成注册  
**When** 用户首次登录  
**Then** 系统应检查会员状态  
**And** 因无会员记录，应重定向到 `/membership` 购买页面  
**And** 不应创建 DSH 实例

## 场景 2：购买体验会员

**Given** 用户在购买页面且 `trial_used=0`  
**When** 用户选择"1 天体验会员"并确认  
**Then** 系统应创建订单（`amount=0`, `status=paid`）  
**And** 标记 `trial_used=1`  
**And** 设置 `membership_type='trial'`，`membership_expires_at=now()+24h`  
**And** 自动创建 DSH 实例  
**And** 重定向到 `/instances` 控制台

## 场景 3：体验会员已使用

**Given** 用户 `trial_used=1`（已体验过）  
**When** 用户进入购买页面  
**Then** "1 天体验会员"选项应显示为不可选（或隐藏）  
**And** 用户只能选择"1 个月会员"或"1 年会员"

## 场景 4：购买付费会员

**Given** 用户选择"1 个月会员"（¥19.9）或"1 年会员"（¥198）  
**When** 用户确认购买  
**Then** 系统应创建订单（`status=paid`，模拟支付成功）  
**And** 设置 `membership_type='monthly'` 或 `'yearly'`  
**And** 设置对应的 `membership_expires_at`  
**And** 若用户无 DSH 实例，自动创建  
**And** 重定向到 `/instances`

## 场景 5：会员到期校验（定时任务）

**Given** 每日 0 点定时任务触发  
**When** 遍历所有 `membership_expires_at IS NOT NULL` 的用户  
**Then** 若 `membership_expires_at < now()`：  
  - 设置 `membership_type=NULL`  
  - 记录日志  
**And** 若 `membership_expires_at >= now()`：  
  - 保持不变

## 场景 6：会员过期后登录

**Given** 用户会员已过期（`membership_type` 被定时任务清除）  
**When** 用户登录  
**Then** 系统应检测到无有效会员  
**And** 重定向到 `/membership` 购买页面  
**And** 用户无法访问实例

## 场景 7：续费流程

**Given** 用户会员即将过期或已过期  
**When** 用户在个人中心点击"续费"  
**Then** 应跳转到 `/membership` 购买页面  
**And** 用户可重新选择套餐购买

## 场景 8：管理员查看用户会员标识

**Given** 管理员登录后台  
**When** 进入用户管理页面  
**Then** 用户列表应显示会员标识（`membership_type` + 到期时间）  
**And** 可区分：体验会员、月付会员、年付会员、无会员

## 场景 9：管理员手动设置会员身份

**Given** 管理员在用户管理页面  
**When** 点击某用户的"设置会员"操作  
**Then** 可选择会员类型（trial/monthly/yearly）和到期时间  
**And** 提交后更新用户的会员状态

## 场景 10：管理员创建用户时选择会员身份

**Given** 管理员在创建用户页面  
**When** 填写用户信息  
**Then** 应可选"是否开通会员"及会员类型  
**And** 若选择开通，用户创建后直接进入控制台（跳过购买页面）

## 场景 11：管理员查看订单列表

**Given** 管理员登录后台  
**When** 进入订单管理页面  
**Then** 应显示所有用户的订单记录（表格）  
**And** 包含：订单 ID、用户昵称、套餐类型、金额、状态、创建时间  
**And** 支持分页

## 场景 12：用户查看个人订单

**Given** 用户登录  
**When** 进入个人中心 → 订单记录  
**Then** 应显示该用户的所有订单  
**And** 包含：订单 ID、套餐类型、金额、状态、创建时间  
**And** 最新订单在前

## 场景 13：非会员访问实例

**Given** 用户会员已过期或从未购买  
**When** 尝试访问 `/i/{user}-{instance}` 实例路径  
**Then** 网关应拒绝访问  
**And** 重定向到 `/membership` 购买页面

## 场景 14：支付接口预留

**Given** 用户确认购买付费会员  
**When** 调用 `POST /api/membership/purchase`  
**Then** 订单 `status` 默认为 `paid`（模拟支付）  
**And** 接口应预留 `payment_method` 和 `payment_id` 字段  
**And** 后续可替换为真实支付逻辑而不影响前端流程
