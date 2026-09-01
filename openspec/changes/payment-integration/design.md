# 支付集成技术方案

## 架构

```
┌──────────┐     ┌──────────────────┐     ┌──────────────────
│  前端     │────▶│  /api/payment     │────▶│  payment.ts      │
│  (二维码) │     │  /create          │     │  (签名+API封装)   │
└──────────┘     └──────────────────┘     └─────────────────┘
                                                    │
                                              POST JSON
                                                    │
                                                    ▼
                                             ┌──────────────┐
                                             │  虎皮椒 API   │
                                             │  do.html     │
                                             └──────────────┘
                                                    │
                                              用户支付
                                                    │
                                                    ▼
┌──────────┐     ┌──────────────────┐     ┌──────────────────
│  成功页   │────│  /api/payment     │────│  虎皮椒回调       │
│ /payment │     │  /notify          │     │  notify_url      │
│ /return  │     └──────────────────┘     ──────────────────┘
──────────┘
```

## 模块设计

### payment.ts（新增）

```typescript
// 签名
export function generateHash(params: Record<string, string>, appsecret: string): string
export function verifyHash(params: Record<string, string>, hash: string, appsecret: string): boolean

// 配置
export interface XunhupayConfig {
  appid: string;
  appsecret: string;
  gateway: string;
}

// API
export function createPayment(config, params): Promise<PaymentResponse>
export function queryPayment(config, tradeOrderId): Promise<QueryResponse>
export function refundPayment(config, tradeOrderId, reason?): Promise<RefundResponse>
```

### membership.ts（改造）

- `createOrder`：移除 `activateMembership` 调用和 `status='paid'` 更新，只创建 pending 订单
- 新增 `handlePaymentCallback(db, tradeOrderId, totalFee, transactionId, status)`：验证金额 → 更新订单 → 激活会员

### api.ts（新增路由）

| 路由 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/payment/create` | POST | 需登录 | 创建订单 + 调虎皮椒 → 返回支付链接 |
| `/api/payment/notify` | POST | 无（签名验证） | 虎皮椒回调 → 验证签名 → 激活会员 |
| `/api/payment/query/:orderId` | GET | 需登录 | 前端轮询订单状态 |

### pages.ts（新增路由）

| 路由 | 方法 | 说明 |
|---|---|---|
| `/payment/return` | GET | 支付成功返回页，显示成功信息 + 跳转按钮 |

## 关键决策

### 1. 订单创建与激活分离

**决策**：`createOrder` 只创建 pending 订单，`activateMembership` 移到回调中调用。

**理由**：接入真实支付后，订单创建 ≠ 支付完成。分离后逻辑清晰，也方便后续支持其他支付渠道。

**风险**：如果回调丢失，订单会卡在 pending。缓解方案：前端轮询 + 管理员后台可手动补激活。

### 2. 前端轮询 vs WebSocket

**决策**：用 HTTP 轮询（3 秒间隔），不用 WebSocket。

**理由**：支付是低频短时操作，轮询实现简单、无额外依赖。WebSocket 对于这个场景过度设计。

### 3. 二维码 vs 直接跳转

**决策**：PC 端显示二维码弹窗，移动端直接跳转支付 URL。

**理由**：虎皮椒返回 `url_qrcode`（PC 扫码）和 `url`（手机跳转），按端选择最佳体验。

### 4. 幂等性

**决策**：回调处理中检查 `order.status === 'paid'`，已支付则直接返回 success。

**理由**：虎皮椒可能重复回调（最多 7 次），必须保证幂等。

### 5. 支付配置方式：管理后台优先，环境变量 fallback

**决策**：虎皮椒 AppID / AppSecret 通过管理后台「全局设置」页面配置，存入 `settings` 表。同时保留环境变量作为 fallback。

**读取优先级**：`settings` 表 > 环境变量 > 默认值

**理由**：
- 个人开发者部署时不一定方便配置环境变量，管理后台配置更直观
- 复用现有 `settings` 表和 `/admin/settings` 页面，改动量小
- 环境变量仍可作为初始化默认值或 CI/CD 场景使用

**实现**：
- `settings.ts` 的 `SETTING_KEYS` 新增 `xunhupay_appid`、`xunhupay_appsecret`
- `views/admin.ts` 的 `renderSettingsPage` 新增两个输入框（AppSecret 显示时脱敏为 `••••••••`，不填则保留原值）
- `payment.ts` 的 `getXunhupayConfig(db)` 从 settings 表读取，fallback 到 `process.env`

## 环境变量（可选 fallback）

```bash
XH_APPID=你的虎皮椒APPID                # 可选，管理后台未配置时使用
XH_APPSECRET=你的虎皮椒APPSECRET         # 可选，管理后台未配置时使用
XH_GATEWAY=https://api.xunhupay.com     # 可选，默认值
```
