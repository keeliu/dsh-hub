# 支付集成实施清单

## Phase 1：基础模块

- [ ] 1.1 新增 `src/payment.ts`：签名函数（generateHash + verifyHash）
- [ ] 1.2 新增 `src/payment.ts`：createPayment 函数（调用虎皮椒 do.html）
- [ ] 1.3 新增 `src/payment.ts`：queryPayment 函数（调用 query.html）
- [ ] 1.4 新增 `src/payment.ts`：refundPayment 函数（调用 refund.html）
- [ ] 1.5 `config.ts` 新增 xunhupay 配置（appid/secret/gateway）

## Phase 2：业务逻辑改造

- [ ] 2.1 改造 `membership.ts`：`createOrder` 移除立即激活逻辑，只创建 pending 订单
- [ ] 2.2 新增 `membership.ts`：`handlePaymentCallback` 函数（签名已在外层验证）
- [ ] 2.3 确保 `activateMembership` 可被 `handlePaymentCallback` 正确调用

## Phase 3：API 路由

- [ ] 3.1 `api.ts` 新增 `POST /api/payment/create`：创建订单 + 调虎皮椒 + 返回支付链接
- [ ] 3.2 `api.ts` 新增 `POST /api/payment/notify`：读取 form 参数 + 验签 + 调 handlePaymentCallback + 返回 "success"
- [ ] 3.3 `api.ts` 新增 `GET /api/payment/query/:orderId`：查订单状态返回

## Phase 4：前端页面

- [ ] 4.1 改造 `views/user.ts` 会员购买页：点击套餐 → 调用 /api/payment/create → 显示二维码/跳转
- [ ] 4.2 新增前端轮询逻辑：每 3 秒查 /api/payment/query/:orderId，paid 后跳转
- [ ] 4.3 `pages.ts` 新增 `GET /payment/return`：支付成功返回页
- [ ] 4.4 改造 `pages.ts` 中 `POST /membership/purchase`：改为调用支付流程（或保留为管理员/体验入口）

## Phase 5：测试与验证

- [ ] 5.1 类型检查通过（tsc --noEmit）
- [ ] 5.2 签名函数单元测试（已知输入 → 已知 hash）
- [ ] 5.3 回调幂等性测试（重复回调不重复激活）
- [ ] 5.4 金额校验测试（篡改金额被拒绝）
- [ ] 5.5 虎皮椒沙箱/小额实测
