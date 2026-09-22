# 支付集成规范

## 术语

- **商户订单号**（`trade_order_id`）：DSH Hub 的 `orders.id`，数字字符串
- **虎皮椒订单号**（`open_order_id`）：虎皮椒平台内部订单 ID
- **交易号**（`transaction_id`）：微信/支付宝侧的交易流水号
- **签名**（`hash`）：MD5 字典序签名，用于接口请求和回调验证

## 签名算法

Given 一组参数集合 M 和 appsecret

When 生成签名

Then 执行以下步骤：
1. 过滤 M 中值为空或 null 的参数
2. 排除 `hash` 字段本身
3. 按参数名 ASCII 字典序升序排序
4. 拼接为 `key1=value1&key2=value2...` 格式
5. 末尾直接拼接 appsecret（无连接符）
6. 对拼接结果做 MD5，输出 32 位小写字符串

## 支付发起

Given 已登录用户选择了一个会员套餐

When 用户点击"立即购买"

Then 系统执行：
1. 调用 `createOrder(db, userId, type)` 创建订单（status = 'pending'）
2. 调用虎皮椒 `/payment/do.html` 接口，传入订单信息
3. 返回支付链接（`url`）和二维码链接（`url_qrcode`）给前端
4. PC 端显示二维码弹窗，移动端直接跳转支付页

## 支付回调

Given 虎皮椒向 `notify_url` 发送 POST 回调

When 服务器收到回调

Then 系统执行：
1. 读取所有 form 参数
2. 调用 `verifyHash` 验证签名，失败则返回 HTTP 400
3. 校验 `total_fee` 与订单 `amount` 一致，不一致则返回 HTTP 400 并记录审计日志
4. 如果订单已是 `paid` 状态，返回 "success"（幂等处理）
5. 如果 `status = 'OD'`（已支付）：
   - 更新订单 `status = 'paid'`，记录 `paid_at` 和 `payment_id`（transaction_id）
   - 调用 `activateMembership` 激活会员
   - 创建 DSH 实例（`ensureInstanceForUser`）
6. 返回纯文本 "success"

## 订单状态轮询

Given 前端在支付页面等待用户完成支付

When 每隔 3 秒调用 `GET /api/payment/query/:orderId`

Then 系统返回：
- `{ status: 'pending', paid: false }` — 前端继续轮询
- `{ status: 'paid', paid: true }` — 前端停止轮询，跳转成功页

## 安全约束

- 回调签名验证失败时，返回 HTTP 400，不执行任何业务逻辑
- 回调金额与订单金额不一致时，返回 HTTP 400，记录审计日志
- `appsecret` 仅从环境变量读取，不写入日志、不返回给客户端
- 订单创建后 30 分钟未支付，前端停止轮询（后端不自动取消，由管理员处理）
- 回调处理必须幂等：重复回调不重复激活会员
