# 修复 DSH 实例页面底部内容被截断

## Why（为什么做）

用户通过 `/workspace` 访问 DSH 实例时，页面底部内容被截断，无法完整显示。

### 根因分析

`injectDeploymentConfig` 函数（`gateway.ts`）只添加了 `body { margin-top: 60px !important; }` 给 Hub 导航栏留空间，但没有调整 body 高度。DSH 页面本身使用 `100vh` 高度布局，导致：

```
Hub 导航栏 (60px) + DSH 页面 (100vh) > 视口高度
```

底部内容被挤出视口，用户无法看到完整页面。

### 问题表现

- 顶部：Hub 层注入的导航栏（"乌鸦 work"，高度 60px）
- 中间：DSH 实例页面（deepseek HARNESS）
- 底部：内容被截断（红色框标注的区域）

## What Changes（做什么）

修改 `gateway.ts` 中 `injectDeploymentConfig` 函数的 CSS 注入逻辑，调整 body 高度为 `calc(100vh - 60px)`，让 DSH 页面在导航栏下方完整显示。

## Impact（影响范围）

- **影响文件**：`dsh-hub/src/gateway.ts`（约 5 行 CSS 样式）
- **影响页面**：所有通过 `/workspace` 访问的 DSH 实例页面
- **风险等级**：低（仅调整 CSS 样式，不影响功能逻辑）
- **向后兼容**：完全兼容，不影响其他页面
