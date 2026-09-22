# 支付回调修复与会员价格管理

## Why（为什么做）

1. **支付回调问题**：用户支付成功后，订单状态没有更新，会员没有被激活。需要检查回调接收逻辑，并添加主动查询订单状态的机制。

2. **个人中心入口缺失**：导航栏的用户头像和昵称没有链接到个人中心页面，用户无法方便地查看自己的会员信息和订单记录。

3. **会员价格硬编码**：当前会员价格硬编码在 `MEMBERSHIP_CONFIG` 中，管理员无法在后台调整价格。需要将价格存储到数据库，并在管理后台提供价格管理界面。

## What Changes（做什么）

### 1. 支付回调修复

- 检查 `/api/payment/notify` 回调路由是否正确接收虎皮椒的回调
- 添加主动查询订单支付状态的 API `GET /api/payment/query/:orderId`
- 前端轮询查询订单状态，确保支付成功后及时更新

### 2. 个人中心入口

- 在导航栏的用户头像和昵称上添加链接，指向 `/profile` 页面

### 3. 会员价格管理

- 在数据库中添加 `membership_prices` 表存储价格配置
- 在管理后台添加价格管理界面
- 修改 `MEMBERSHIP_CONFIG` 从数据库读取价格
- 会员购买页面从后端 API 获取价格

## Impact（影响范围）

### 受影响文件

- `src/api.ts` - 添加订单查询 API
- `src/membership.ts` - 添加价格管理函数
- `src/db.ts` - 添加价格表 Migration
- `src/views/layout.ts` - 导航栏添加个人中心链接
- `src/views/admin.ts` - 添加价格管理界面
- `src/views/user.ts` - 会员购买页面从 API 获取价格
- `src/pages.ts` - 添加价格管理路由

### 向后兼容性

- 数据库 Migration v5 添加价格表
- 如果价格表为空，使用默认价格（从 `MEMBERSHIP_CONFIG` 读取）
