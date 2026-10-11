# 金额单位与格式规范

本规范是为本变更**新增**的长期规范，归属 `openspec/specs/` 的金额领域（现有 `data-model.md` 未覆盖 `orders` / `membership_prices`，故独立成篇）。

## 术语

- **分（cents）**：人民币最小单位，整数。`1990` = `¥19.90`。
- **元字符串（yuan string）**：保留 2 位小数的十进制字符串，如 `"19.90"`。虎皮椒（xunhupay）的 `total_fee` 即此形态。
- **展示层**：SSR 模板与面向浏览器的 JSON 响应。

---

## Requirement: 金额以「分」为唯一存储单位

存储层中所有金额字段的单位必须是**分**，且为整数语义；元只允许出现在对外网关的出入参与展示层。

### Scenario: orders.amount 的单位
- **Given** 一条 `orders` 记录
- **When** 该记录被写入或读取
- **Then** `amount` 的值是整数分（`¥19.90` 的订单存 `1990`）
- **And** 不得存小数元（如 `19.9`）

### Scenario: membership_prices 的单位
- **Given** `membership_prices` 表
- **When** 读取任一行的 `price` 或 `original_price`
- **Then** 两者均为整数分

### Scenario: 默认价格播种
- **Given** 全新数据库完成迁移
- **When** 读取默认套餐价格
- **Then** `monthly.price = 1990`、`monthly.original_price = 2990`
- **And** `yearly.price = 19900`、`yearly.original_price = 29900`
- **And** `trial.price = 0`、`trial.original_price = 990`

### Scenario: 价格兜底路径也必须是分
- **Given** `membership_prices` 表中缺少 `monthly` 行
- **When** 调用 `getMembershipPrice(db, 'monthly')`
- **Then** 返回值是 `1990`（分），**不是** `19.9`（元）
- **And** 该值被后续下单逻辑当作分使用时不产生 100 倍误差

---

## Requirement: 展示层通过唯一函数格式化金额

所有面向用户的金额渲染必须经由 `formatMoney(cents)`，禁止裸 `.toFixed(2)`。

### Scenario: 列表与详情金额格式一致
- **Given** 订单金额为 `1990` 分
- **When** 渲染管理端订单列表、用户端个人中心、支付弹窗
- **Then** 三处均显示 `¥19.90`
- **And** 不得出现 `¥1990.00` 或 `¥0.20`

### Scenario: 元单位提示
- **Given** 页面显示金额
- **When** 金额出现在概览卡或指标卡
- **Then** 数字用 `--fs-metric-lg`/`--fs-metric` + `tabular-nums`
- **And** 单位 `CNY` 以 `--fs-caption`、`--text-secondary` 紧随其后（比例 2:1 ~ 2.4:1）

### Scenario: 千分位与两位小数
- **Given** 金额为 `199000` 分
- **When** 渲染
- **Then** 显示 `¥1,990.00`

---

## Requirement: 元↔分换算只允许出现在支付边界

换算函数集中在 `src/payment.ts`（或 `views/format.ts` 并由 payment 引用），且仅在下单请求与回调校验两处调用。

### Scenario: 下单请求换算为元字符串
- **Given** 套餐价为 `1990` 分
- **When** 构造虎皮椒下单参数
- **Then** `total_fee` 为 `"19.90"`

### Scenario: 回调金额校验先归一到分
- **Given** 订单 `amount = 1990`（分）
- **And** 虎皮椒回调 `total_fee = "19.90"`（元）
- **When** 处理支付回调
- **Then** 两侧均归一为分后比较（`1990 === 1990`）
- **And** 校验通过并激活会员

### Scenario: 回调金额不一致
- **Given** 订单 `amount = 1990`（分）
- **And** 虎皮椒回调 `total_fee = "1.99"`
- **When** 处理支付回调
- **Then** 返回 `fee mismatch`
- **And** 不激活会员，写入 `audit(db, 'order_pay', …, 'fee_mismatch,…')`

### Scenario: 元字符串的容错与拒绝
- **Given** 回调 `total_fee` 为字符串
- **When** 换算为分
- **Then** `"19.9"` 与 `"19.90"` 均得到 `1990`（不得因字符串不等而误判）
- **And** `"19.999"`、`"-1"`、`"abc"`、空值必须被拒绝（返回失败而非静默取整）

### Scenario: 主动查单触发回调路径同样归一
- **Given** `GET /api/payment/query/:orderId` 查到虎皮椒状态为 `OD`
- **When** 触发 `handlePaymentCallback`
- **Then** 传入的金额参数是从 `orders.amount`（分）**换算成元**的字符串
- **And** 不得直接传 `String(order.amount)`（那会把 `1990` 当元）

---

## Requirement: 金额列必须是整数语义

`orders.amount` 与 `membership_prices.price` / `original_price` 的列类型必须保证整数语义，禁止 `REAL`。

### Scenario: 禁止 REAL 亲和性导致小数混入
- **Given** 迁移后的 schema
- **When** 检查列定义
- **Then** 金额列为 `INTEGER NOT NULL`（保留 `CHECK(x >= 0)`）
- **And** 不存在「同一列既有 `1990` 又有 `19.9`」的可能

### Scenario: 存量数据只收敛存储类，不猜测单位
- **Given** 旧库中同一列混存了整数分（`1990`）与单位为元的小数（`19.9`）
- **When** 执行迁移 v8
- **Then** 该列被重建为 `INTEGER`，小数按四舍五入落为整数（`19.9 → 20`）
- **And** 已是整数分的行**逐字保持不变**（不做任何 `×100` 换算）
- **And** 迁移在单个事务内完成且幂等
- **Rationale** 数值本身无法区分「1990 分」与「1990 元」，任何 `×100` 启发式都会在部分取值上猜错（曾用「`0 < 值 < 100` 视为元」的判据，漏掉 198 元年费）；单位错误的存量行改由 `getSuspiciousMoneyValues()` 提示后人工定值。

### Scenario: 疑似单位错误的值必须被提示
- **Given** 迁移完成后的数据库
- **When** 调用 `getSuspiciousMoneyValues(db)`
- **Then** 返回所有 `0 < 金额 < 100` 的记录（含表名、行 id、字段、当前值）
- **And** 该结果供管理端提示「该金额可能是 1 元以下的分值，也可能是误存的元值」

### Scenario: 迁移前必须备份
- **Given** 执行 v8 迁移
- **When** 迁移开始
- **Then** 数据库文件已存在同目录 `.bak` 备份
- **And** 回滚路径为「还原备份 + 回退代码」

---

## Requirement: 金额语义写入规范文档

### Scenario: data-model 明确单位
- **Given** `openspec/specs/data-model.md`
- **When** 查阅 `orders` 与 `membership_prices` 相关章节
- **Then** 明确标注金额单位为「分」
- **And** 若该文件尚未覆盖这两张表，则由本变更补充对应 Requirement

### Scenario: 禁止单位注释与实现冲突
- **Given** 代码中存在金额常量或配置
- **When** 其注释声明单位
- **Then** 注释单位必须与存储单位（分）一致
- **And** `MEMBERSHIP_CONFIG` 中的 `price` 字段若保留小数元语义，必须改名为 `priceYuan` 或改为分，不得与 `getMembershipPrice` 的返回单位混淆
