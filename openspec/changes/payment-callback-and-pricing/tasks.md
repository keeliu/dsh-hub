# 实施任务清单

## 阶段 1：支付回调修复

- [ ] 1.1 检查 `/api/payment/notify` 回调路由
  - 确认路由配置正确
  - 确认回调处理逻辑正确
  - 添加日志记录回调接收情况

- [ ] 1.2 添加 `GET /api/payment/query/:orderId` API
  - 在 `api.ts` 中添加路由
  - 调用虎皮椒查询 API
  - 如果订单已支付，返回订单状态
  - 如果订单未支付但虎皮椒显示已支付，触发回调处理

- [ ] 1.3 在 `payment.ts` 中添加 `queryPayment` 函数
  - 封装虎皮椒查询 API 调用
  - 处理签名和响应验证

## 阶段 2：个人中心入口

- [ ] 2.1 修改导航栏
  - 在 `layout.ts` 的 `renderNav` 函数中
  - 将用户头像和昵称包裹在 `<a href="/profile">` 链接中

## 阶段 3：会员价格管理

- [ ] 3.1 数据库 Migration v5
  - 在 `db.ts` 中添加 `membership_prices` 表
  - 添加 `getMembershipPrices` 和 `setMembershipPrice` 函数

- [ ] 3.2 修改 `membership.ts`
  - 将 `MEMBERSHIP_CONFIG` 改为 `getMembershipConfig(db)` 函数
  - 从数据库读取价格，如果不存在则使用默认价格

- [ ] 3.3 添加 `GET /api/membership/plans` API
  - 在 `api.ts` 中添加路由
  - 返回当前会员套餐价格

- [ ] 3.4 修改会员购买页面
  - 在 `user.ts` 的 `renderMembershipPage` 中
  - 从 API 获取价格，而不是硬编码

- [ ] 3.5 添加管理后台价格管理界面
  - 在 `admin.ts` 中添加价格管理表单
  - 在 `pages.ts` 中添加价格保存路由

## 阶段 4：验证

- [ ] 4.1 类型检查
  - 运行 `tsc -p . --noEmit` 确保无错误

- [ ] 4.2 功能验证
  - 测试支付回调接收
  - 测试订单状态查询
  - 测试个人中心入口
  - 测试价格管理
