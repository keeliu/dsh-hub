# 技术方案：DSH 实例页面整屏显示

## 问题定位

### 代码调用链

```
GET /workspace
  ↓
handleWorkspaceEntry()
  ↓
获取 DSH 实例的 index.html
  ↓
rewriteHtmlPaths() - 重写资源路径
  ↓
injectDeploymentConfig() - 注入导航栏和配置
  ↓
返回修改后的 HTML
```

### 当前 CSS（有问题）

```css
body {
  margin-top: 60px !important;
}
```

### 问题分析

1. 只添加了 `margin-top: 60px` 给导航栏留空间
2. 没有调整 body 高度
3. DSH 页面使用 `100vh` 高度，导致总高度超出视口
4. 底部内容被截断

## 解决方案

### 方案选择

**选择方案 A：调整 body 高度为 calc(100vh - 60px)**

理由：
1. 改动最小（仅修改 CSS）
2. 精确计算可用高度
3. 适配不同屏幕尺寸
4. 不影响 DSH 页面内部布局

**备选方案 B：给 DSH 页面根元素添加 .workspace-content 类**

不选择原因：
1. 需要修改 HTML 结构
2. DSH 页面根元素类名不确定
3. 改动范围大，风险高

### 实现细节

**修改文件**：`dsh-hub/src/gateway.ts`

**修改位置**：`injectDeploymentConfig` 函数中的 CSS 注入部分（约第 529-533 行）

**修改前**：
```typescript
<style>
body {
  margin-top: 60px !important;
}
</style>
```

**修改后**：
```typescript
<style>
html, body {
  height: 100%;
  overflow: hidden;
  margin: 0;
  padding: 0;
}
body {
  margin-top: 60px !important;
  height: calc(100vh - 60px) !important;
  overflow-y: auto !important;
}
</style>
```

### 关键决策

1. **为什么用 `calc(100vh - 60px)`？**
   - 精确计算可用高度（视口高度 - 导航栏高度）
   - 适配不同屏幕尺寸，无需硬编码

2. **为什么用 `!important`？**
   - 覆盖 DSH 页面原有样式
   - 确保样式优先级最高

3. **为什么设置 `html, body { overflow: hidden; }`？**
   - 防止整体页面滚动
   - 只允许 body 内部滚动
   - 避免双重滚动条

4. **为什么设置 `body { overflow-y: auto; }`？**
   - 允许 body 内部垂直滚动
   - DSH 页面内容可以正常滚动查看

## 测试策略

1. **手动验证**：访问 `/workspace` 页面，确认 DSH 页面完整显示
2. **滚动测试**：确认页面可以正常滚动，无双重滚动条
3. **分辨率测试**：在不同分辨率下验证显示效果
4. **回归测试**：确认 Hub 层其他页面不受影响

## 回滚方案

如果修复后出现问题，可以回滚到修改前的 CSS：

```css
body {
  margin-top: 60px !important;
}
```

但回滚后底部截断问题会重新出现。
