# 任务清单：免费体验与双价格展示

## Phase 1: 数据库迁移与后端变更 ✅

- [x] 添加 Migration v6：`membership_prices` 表新增 `original_price` 字段
- [x] 更新 `getAllMembershipPrices` 函数返回双价格结构
- [x] 更新 `setMembershipPrice` 函数支持双价格参数
- [x] 更新 `getMembershipOriginalPrice` 函数获取原价
- [x] 更新支付创建 API 处理零金额订单（跳过支付网关）
- [x] 更新会员计划 API 返回双价格

## Phase 2: 会员购买页面双价格展示 ✅

- [x] 更新 `renderMembershipPage` 函数签名
- [x] 更新定价卡片展示双价格（原价删除线 + 优惠价红色放大）
- [x] 添加 CSS 样式支持双价格展示

## Phase 3: 管理后台价格管理双价格 ✅

- [x] 更新 `renderAdminPricesPage` 函数签名
- [x] 更新价格管理表单支持双价格输入
- [x] 更新价格管理 API 处理双价格

## Phase 4: 类型检查与验证 ✅

- [x] 运行 `tsc --noEmit` 确保类型检查通过
- [x] 验证所有变更符合规范文档要求
