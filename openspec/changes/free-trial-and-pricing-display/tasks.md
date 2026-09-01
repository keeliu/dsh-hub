# 实施任务：免费体验与双价格展示

## 阶段 1：数据库变更

- [ ] 1.1 在 `db.ts` 中添加 Migration v6，为 `membership_prices` 表新增 `original_price` 字段
- [ ] 1.2 更新 `inferSchemaVersion` 函数支持 v6

## 阶段 2：后端变更

- [ ] 2.1 更新 `membership.ts` 中的 `getMembershipPrice` 函数，返回原价和优惠价
- [ ] 2.2 更新 `membership.ts` 中的 `setMembershipPrice` 函数，支持设置原价
- [ ] 2.3 更新 `membership.ts` 中的 `getAllMembershipPrices` 函数，返回原价
- [ ] 2.4 更新 `membership.ts` 中的 `createOrder` 函数，处理零金额订单
- [ ] 2.5 更新 `api.ts` 中的 `GET /api/membership/plans`，返回双价格
- [ ] 2.6 更新 `api.ts` 中的 `POST /admin/api/membership-prices`，支持设置双价格

## 阶段 3：前端变更

- [ ] 3.1 更新 `views/user.ts` 中的会员购买页面，展示双价格
- [ ] 3.2 添加原价删除线和优惠价标红的 CSS 样式
- [ ] 3.3 更新前端支付流程，处理零金额订单
- [ ] 3.4 更新 `views/admin.ts` 中的价格管理表单，新增原价输入框

## 阶段 4：验证

- [ ] 4.1 运行类型检查
- [ ] 4.2 验证零金额订单流程
- [ ] 4.3 验证双价格展示

## 默认价格配置

| 套餐 | 原价 | 优惠价 |
|------|------|--------|
| 1天体验 | 9.9元 | 0元 |
| 月会员 | 29.9元 | 19.9元 |
| 年会员 | 299元 | 199元 |
