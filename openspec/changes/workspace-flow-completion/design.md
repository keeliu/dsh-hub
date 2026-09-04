# Workspace 流程收尾技术方案

## 改动清单

### 1. 支付返回页按钮（`views/user.ts`）

**位置**：`renderPaymentReturnPage` 函数中的操作按钮区域

**改动**：
```diff
- <a href="/" class="btn btn-primary">进入首页</a>
+ <a href="/workspace" class="btn btn-primary">进入工作区</a>
```

### 2. 首页重定向（`pages.ts`）

**位置**：`GET /` 路由处理中，会员检查通过后的分支

**当前逻辑**：
```typescript
if (!hasActiveMembership(db, auth.user.id)) {
  redirect(res, '/membership'); return;
}
// 渲染实例列表页
renderPage(res, renderInstancesPage(...));
```

**改为**：
```typescript
if (!hasActiveMembership(db, auth.user.id)) {
  redirect(res, '/membership'); return;
}
redirect(res, '/workspace');
```

### 3. 登录后跳转（`pages.ts`）

**位置**：`POST /login` 处理中，登录成功后的跳转逻辑

**当前逻辑**：
```typescript
const hasMembership = hasActiveMembership(db, user.id);
redirect(res, hasMembership ? '/' : '/membership');
```

**改为**：
```typescript
const hasMembership = hasActiveMembership(db, user.id);
redirect(res, hasMembership ? '/workspace' : '/membership');
```

## 关键决策

### 实例列表页的访问方式

**决策**：首页 `/` 不再渲染实例列表页，改为重定向到 `/workspace`。实例列表页仍保留在 `/instances` 路径，通过导航栏「实例管理」访问。

**理由**：付费用户的核心使用场景是直接在 Workspace 中使用 DSH 实例，而非管理实例列表。实例管理是低频操作，放在二级入口更合理。

### 管理员登录不受影响

**决策**：管理员（admin/root）登录后仍进入管理后台，不重定向到 `/workspace`。

**理由**：管理员的核心工作是管理用户和系统，不是使用 DSH 实例。现有 `POST /login` 逻辑中管理员已经有独立的跳转分支（`redirect(res, '/admin')`），不受本次改动影响。

## 影响范围

| 文件 | 改动行数 | 风险 |
|---|---|---|
| `src/views/user.ts` | ~1 行 | 极低 |
| `src/pages.ts` | ~2 行 | 低 |
