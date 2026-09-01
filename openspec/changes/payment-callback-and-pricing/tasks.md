# 任务清单

## 阶段 1：支付回调修复与主动查询 ✅

- [x] 检查支付回调接收逻辑
- [x] 更新 `GET /api/payment/query/:orderId` API 主动查询虎皮椒订单状态
- [x] 查询时如果虎皮椒显示已支付，触发回调处理逻辑

## 阶段 2：个人中心入口 ✅

- [x] 导航栏用户头像和昵称添加链接到 `/profile`
- [x] 添加 CSS 样式

## 阶段 3：会员价格管理 ✅

- [x] 数据库 Migration v5：创建 `membership_prices` 表
- [x] 添加 `getMembershipPrice`、`getAllMembershipPrices`、`setMembershipPrice` 函数
- [x] 更新 `createOrder` 使用动态价格
- [x] 更新 `GET /api/membership/plans` API 返回动态价格
- [x] 添加 `GET /admin/api/membership-prices` API
- [x] 添加 `POST /admin/api/membership-prices` API
- [x] 添加管理后台价格管理页面
- [x] 添加管理后台侧边栏链接
- [x] 更新会员购买页面使用动态价格

## 阶段 4：类型检查与验证 ✅

- [x] 运行 `npx tsc -p . --noEmit` 确认无错误
