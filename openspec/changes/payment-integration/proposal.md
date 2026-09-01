# 支付集成：虎皮椒支付接入

## Why

DSH Hub 已完成会员系统（membership），但当前付费流程是"订单创建即激活"，没有真实的支付环节。作为个人开发者，无法直接接入微信/支付宝官方商户接口，需要通过虎皮椒（xunhupay.com）聚合支付平台实现收款能力。

接入支付后：
- 用户付费体验完整（选择套餐 → 扫码/跳转支付 → 回调激活）
- 订单状态真实反映支付情况（pending → paid）
- 为后续自动续费、退款等功能奠定基础

## What Changes

1. **新增 `payment.ts` 模块**：封装虎皮椒 API（签名生成/验证、发起支付、订单查询、退款）
2. **改造 `membership.ts`**：拆分 `createOrder`（只创建 pending 订单）和 `activateMembership`（回调时调用）
3. **新增支付 API 路由**：`POST /api/payment/create`、`POST /api/payment/notify`、`GET /api/payment/query/:orderId`
4. **改造会员购买页**：点击套餐 → 弹出二维码/跳转支付 → 轮询状态 → 成功后跳转
5. **新增支付成功返回页**：`GET /payment/return`
6. **新增配置项**：`XH_APPID`、`XH_APPSECRET`、`XH_GATEWAY`

## Impact

- **新增文件**：`src/payment.ts`
- **修改文件**：`src/config.ts`、`src/membership.ts`、`src/api.ts`、`src/pages.ts`、`src/views/user.ts`
- **数据库**：`orders` 表无需新增字段（已有 `payment_method`、`payment_id`）
- **环境变量**：新增 `XH_APPID`、`XH_APPSECRET`（`XH_GATEWAY` 可选）
- **不影响**：管理员手动设置会员（`adminSetMembership`）、体验会员领取、到期检查逻辑
