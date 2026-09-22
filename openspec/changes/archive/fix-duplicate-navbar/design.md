# 技术方案：修复实例管理页面导航栏重复

## 问题定位

### 代码调用链

```
GET /instances
  ↓
pages.ts:413
  ↓
layout('实例管理', renderInstancesPage(...), ...)  ← 第一次 layout
  ↓
renderInstancesPage() 内部
  ↓
layout('我的实例', content, ...)  ← 第二次 layout（重复）
  ↓
renderNav() → 渲染导航栏
```

### 根因

`pages.ts` 第 413 行错误地将 `renderInstancesPage` 的返回值再次传递给 `layout` 函数，导致页面被渲染两次。

## 解决方案

### 方案选择

**选择方案 A：移除多余的 layout 包裹**

理由：
1. 与其他页面保持一致（`renderNewInstancePage`、`renderInstanceDetailPage` 等都是内部调用 `layout`）
2. 改动最小（仅修改 1 行代码）
3. 符合现有代码约定

**备选方案 B：修改 renderInstancesPage 不再调用 layout**

不选择原因：
1. 需要修改多个调用点
2. 破坏现有约定（其他 `renderXxxPage` 都是内部调用 `layout`）
3. 改动范围大，风险高

### 实现细节

**修改文件**：`dsh-hub/src/pages.ts`

**修改位置**：第 413 行

**修改前**：
```typescript
sendHtml(res, 200, layout('实例管理', renderInstancesPage(auth.user, instances, undefined, csrf), auth.user, undefined, csrf));
```

**修改后**：
```typescript
sendHtml(res, 200, renderInstancesPage(auth.user, instances, undefined, csrf));
```

### 关键决策

1. **为什么保留 renderInstancesPage 内部的 layout 调用？**
   - 与其他 `renderXxxPage` 函数保持一致
   - 页面标题、布局由视图层控制，符合 MVC 分层

2. **为什么不用 layout 包裹？**
   - `renderInstancesPage` 已经返回完整的 HTML 页面
   - 再次包裹会导致重复渲染

## 测试策略

1. **手动验证**：访问 `/instances` 页面，确认只显示一个导航栏
2. **回归测试**：检查其他页面（`/instances/new`、`/instances/:id`、`/profile` 等）是否正常
3. **代码审查**：确认所有 `renderXxxPage` 调用方式一致

## 回滚方案

如果修复后出现问题，可以回滚到修改前的代码：

```typescript
sendHtml(res, 200, layout('实例管理', renderInstancesPage(auth.user, instances, undefined, csrf), auth.user, undefined, csrf));
```

但回滚后问题会重新出现。
