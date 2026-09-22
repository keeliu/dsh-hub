# 技术方案设计

## 1. 支付回调修复

### 1.1 回调接收

当前 `/api/payment/notify` 路由已经实现：
- 接收虎皮椒的 POST 回调（form-urlencoded 格式）
- 验证签名
- 调用 `handlePaymentCallback` 处理回调
- 返回纯文本 "success"

### 1.2 主动查询

添加 `GET /api/payment/query/:orderId` API：
- 需要用户登录
- 验证订单属于当前用户
- 调用虎皮椒查询 API `payment/query.html`
- 如果订单已支付，返回订单状态
- 如果订单未支付但虎皮椒显示已支付，触发回调处理逻辑

```typescript
// 查询参数
{
  appid: string,
  out_trade_order: string,  // 商户订单号
  time: number,
  nonce_str: string,
  hash: string,
}

// 响应
{
  errcode: number,
  data: {
    status: 'OD' | 'WP' | 'CD',  // OD=已支付, WP=待支付, CD=已取消
    open_order_id: string,
    ...
  },
  errmsg: string,
  hash: string,
}
```

### 1.3 前端轮询

会员购买页面已有轮询逻辑（每 3 秒调用 `/api/payment/query/:orderId`），需要确保：
- 轮询 API 返回正确的订单状态
- 支付成功后停止轮询并跳转

## 2. 个人中心入口

### 2.1 导航栏修改

在 `renderNav` 函数中，将用户头像和昵称包裹在链接中：

```html
<a href="/profile" class="navbar-user">
  <div class="avatar">${initial}</div>
  <span>${escapeHtml(user.nickname)}</span>
</a>
```

## 3. 会员价格管理

### 3.1 数据库设计

添加 `membership_prices` 表：

```sql
CREATE TABLE IF NOT EXISTS membership_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  membership_type TEXT NOT NULL UNIQUE,  -- 'trial', 'monthly', 'yearly'
  price REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by INTEGER REFERENCES users(id)
);
```

### 3.2 价格读取

修改 `MEMBERSHIP_CONFIG` 为函数，从数据库读取价格：

```typescript
export function getMembershipConfig(db: DatabaseSync): MembershipConfig {
  const prices = getMembershipPrices(db);
  return {
    trial: {
      ...DEFAULT_CONFIG.trial,
      price: prices.trial ?? DEFAULT_CONFIG.trial.price,
    },
    monthly: {
      ...DEFAULT_CONFIG.monthly,
      price: prices.monthly ?? DEFAULT_CONFIG.monthly.price,
    },
    yearly: {
      ...DEFAULT_CONFIG.yearly,
      price: prices.yearly ?? DEFAULT_CONFIG.yearly.price,
    },
  };
}
```

### 3.3 管理后台界面

在管理后台添加价格管理表单：

```html
<form method="POST" action="/admin/membership/prices">
  <label>体验会员价格（元）</label>
  <input type="number" step="0.01" name="trial_price" value="...">
  
  <label>月度会员价格（元）</label>
  <input type="number" step="0.01" name="monthly_price" value="...">
  
  <label>年度会员价格（元）</label>
  <input type="number" step="0.01" name="yearly_price" value="...">
  
  <button type="submit">保存价格</button>
</form>
```

### 3.4 API 获取价格

添加 `GET /api/membership/plans` API：
- 无需登录
- 返回当前会员套餐价格

```typescript
{
  plans: [
    { type: 'trial', label: '体验会员', price: 0.01, duration: 1, ... },
    { type: 'monthly', label: '月度会员', price: 29.9, duration: 30, ... },
    { type: 'yearly', label: '年度会员', price: 299.9, duration: 365, ... },
  ]
}
```

### 3.5 前端获取价格

会员购买页面从 API 获取价格，而不是硬编码：

```javascript
const response = await fetch('/api/membership/plans');
const { plans } = await response.json();
// 渲染套餐卡片
```
