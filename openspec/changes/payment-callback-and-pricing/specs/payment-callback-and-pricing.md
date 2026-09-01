# 功能规范

## 场景 1：支付回调接收

**Given** 用户已完成支付
**When** 虎皮椒发送回调到 `/api/payment/notify`
**Then** 系统验证签名
**And** 更新订单状态为 `paid`
**And** 激活用户会员
**And** 返回纯文本 "success"

## 场景 2：支付回调签名验证失败

**Given** 收到支付回调
**When** 签名验证失败
**Then** 记录审计日志 `payment_notify: hash_verify_failed`
**And** 返回 400 错误

## 场景 3：主动查询订单状态

**Given** 用户已登录
**When** 调用 `GET /api/payment/query/:orderId`
**Then** 验证订单属于当前用户
**And** 调用虎皮椒查询 API
**And** 返回订单状态

## 场景 4：查询时订单已支付

**Given** 订单状态为 `paid`
**When** 调用查询 API
**Then** 直接返回订单状态，不调用虎皮椒 API

## 场景 5：查询时订单未支付但虎皮椒显示已支付

**Given** 订单状态为 `pending`
**When** 调用查询 API
**And** 虎皮椒返回状态为 `OD`（已支付）
**Then** 触发回调处理逻辑
**And** 更新订单状态为 `paid`
**And** 激活用户会员

## 场景 6：个人中心入口

**Given** 用户已登录
**When** 查看导航栏
**Then** 用户头像和昵称显示为可点击链接
**And** 点击后跳转到 `/profile` 页面

## 场景 7：会员价格管理 - 查看价格

**Given** 管理员已登录
**When** 访问管理后台会员价格管理页面
**Then** 显示当前各套餐的价格
**And** 如果未设置，显示默认价格

## 场景 8：会员价格管理 - 修改价格

**Given** 管理员已登录
**When** 修改套餐价格并提交
**Then** 价格保存到数据库
**And** 记录审计日志 `membership_price_update`

## 场景 9：会员购买页面获取价格

**Given** 用户访问会员购买页面
**When** 页面加载
**Then** 从 `/api/membership/plans` API 获取价格
**And** 显示最新价格

## 场景 10：价格 API 返回

**Given** 调用 `GET /api/membership/plans`
**When** 请求成功
**Then** 返回所有套餐信息
**And** 包含最新价格
