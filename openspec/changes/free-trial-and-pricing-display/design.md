# 技术方案：免费体验与双价格展示

## 数据库变更

### Migration v6：membership_prices 表新增 original_price 字段

```sql
ALTER TABLE membership_prices ADD COLUMN original_price INTEGER NOT NULL DEFAULT 0;
```

默认值说明：
- 1天体验：original_price = 990 (9.9元), price = 0 (免费)
- 月会员：original_price = 2990 (29.9元), price = 1990 (19.9元)
- 年会员：original_price = 29900 (299元), price = 19900 (199元)

## 后端变更

### membership.ts

#### getMembershipPrice 返回值变更
```typescript
export interface MembershipPriceInfo {
  type: MembershipType;
  price: number;           // 优惠价（实际支付金额）
  originalPrice: number;   // 原价
  duration: number;
  label: string;
}

export function getMembershipPrice(db: Database, type: MembershipType): MembershipPriceInfo | null
```

#### createOrder 零金额处理
```typescript
export async function createOrder(db: Database, userId: number, membershipType: MembershipType): Promise<OrderRow> {
  // ... 获取价格
  
  const orderNo = generateOrderNo();
  const now = new Date().toISOString();
  
  // 零金额订单直接标记为已支付
  const status = priceInfo.price === 0 ? 'paid' : 'pending';
  
  // ... 插入订单
  
  // 零金额订单直接激活
  if (priceInfo.price === 0) {
    await activateOrder(db, orderNo, { transactionId: 'free_trial', status: 'OD' });
  }
  
  return order;
}
```

### api.ts

#### GET /api/membership/plans 返回双价格
```typescript
page('GET', '/api/membership/plans', ({ db }) => {
  const plans = MEMBERSHIP_TYPES.map(type => {
    const priceInfo = getMembershipPrice(db, type);
    return {
      type,
      label: MEMBERSHIP_CONFIG[type].label,
      duration: MEMBERSHIP_CONFIG[type].duration,
      price: priceInfo?.price ?? MEMBERSHIP_CONFIG[type].price,
      originalPrice: priceInfo?.originalPrice ?? MEMBERSHIP_CONFIG[type].price,
    };
  });
  return { plans };
});
```

#### POST /admin/api/membership-prices 支持设置双价格
```typescript
page('POST', '/admin/api/membership-prices', async ({ db, req, user }) => {
  assertRole(user, 'admin', 'root');
  const body = await readJson(req);
  const { type, price, originalPrice } = body;
  
  if (!type || price === undefined || originalPrice === undefined) {
    throw new HttpError(400, 'invalid_request', '缺少参数');
  }
  
  setMembershipPrice(db, type as MembershipType, price, originalPrice);
  // ...
});
```

## 前端变更

### views/user.ts - 会员购买页面

#### 价格展示样式
```html
<div class="pricing-card">
  <div class="price-section">
    <span class="original-price">¥9.9</span>
    <span class="current-price">¥0</span>
  </div>
  <!-- 或者 -->
  <div class="price-section">
    <span class="original-price">¥29.9</span>
    <span class="current-price">¥19.9</span>
  </div>
</div>
```

#### CSS 样式
```css
.original-price {
  text-decoration: line-through;
  color: #999;
  font-size: 14px;
  margin-right: 8px;
}

.current-price {
  color: #e53935;
  font-size: 28px;
  font-weight: bold;
}
```

#### 零金额支付流程
```javascript
async function startPayment(type) {
  const response = await fetch('/api/payment/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ type }),
  });
  
  const data = await response.json();
  
  if (data.freeTrial) {
    // 零金额，直接跳转成功页
    showStatus('正在开通...', 'info');
    setTimeout(() => {
      window.location.href = '/payment/return?order_id=' + data.orderId;
    }, 1000);
    return;
  }
  
  // 正常支付流程，显示二维码
  showQrCode(data.qrcodeUrl);
  startPolling(data.orderId);
}
```

### views/admin.ts - 价格管理表单

```html
<form id="price-form-${type}">
  <input type="hidden" name="type" value="${type}">
  <div class="form-group">
    <label>原价（元）</label>
    <input type="number" name="originalPrice" step="0.01" value="${(originalPrice / 100).toFixed(2)}">
  </div>
  <div class="form-group">
    <label>优惠价（元）</label>
    <input type="number" name="price" step="0.01" value="${(price / 100).toFixed(2)}">
  </div>
  <button type="submit">保存</button>
</form>
```

## 支付流程变更

### 零金额订单流程
```
用户点击购买
    ↓
POST /api/payment/create
    ↓
createOrder() 检测到 price === 0
    ↓
订单状态直接设为 'paid'
    ↓
调用 activateOrder() 激活会员
    ↓
返回 { freeTrial: true, orderId: '...' }
    ↓
前端显示"正在开通..."
    ↓
跳转到 /payment/return
```

### 正常金额订单流程（不变）
```
用户点击购买
    ↓
POST /api/payment/create
    ↓
createOrder() 创建 pending 订单
    ↓
调用虎皮椒 API 获取支付链接
    ↓
返回 { qrcodeUrl, orderId }
    ↓
前端显示二维码
    ↓
轮询 /api/payment/query/:orderId
    ↓
支付成功后跳转
```
