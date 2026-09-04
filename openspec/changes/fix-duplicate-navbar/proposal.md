# 修复实例管理页面导航栏重复渲染

## Why（为什么做）

用户报告访问 `/instances`（实例管理）页面时，页面顶部出现两个相同的导航栏，严重影响用户体验。

### 根因分析

在 `pages.ts` 第 413 行，`/instances` 路由处理逻辑存在重复渲染：

```typescript
// 错误：外层又包裹了一次 layout
sendHtml(res, 200, layout('实例管理', renderInstancesPage(...), ...));
```

但 `renderInstancesPage` 函数内部（`views/user.ts` 第 106 行）已经调用了 `layout` 函数：

```typescript
// renderInstancesPage 内部已经调用 layout
return layout('我的实例', content, user, flash, csrf);
```

这导致页面被 `layout` 函数渲染了**两次**，每次都会渲染一个导航栏。

### 对比其他页面

其他页面的调用方式都是正确的，直接调用 `renderXxxPage`，不再用 `layout` 包裹：

```typescript
// 正确：直接调用 renderXxxPage
sendHtml(res, 200, renderNewInstancePage(auth.user, undefined, csrf));
sendHtml(res, 200, renderInstanceDetailPage(auth.user, inst, logs, csrf));
```

## What Changes（做什么）

修改 `pages.ts` 第 413 行，移除多余的 `layout` 包裹，与其他页面保持一致。

## Impact（影响范围）

- **影响文件**：`dsh-hub/src/pages.ts`（1 行代码）
- **影响页面**：`/instances`（实例管理页面）
- **风险等级**：低（仅修改一行代码，修复渲染 bug）
- **向后兼容**：完全兼容，不影响其他功能
