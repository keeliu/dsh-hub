# 技术方案：UI 视觉风格重设计

## 设计系统

### CSS 变量定义

```css
:root {
  /* 主色 */
  --primary: #0066cc;
  --primary-hover: #0052a3;
  
  /* 背景色 */
  --bg-body: #ffffff;
  --bg-input: #f5f5f5;
  --bg-sidebar: #ffffff;
  --bg-navbar: #1a1a1a;
  
  /* 文字色 */
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --text-placeholder: #999999;
  --text-white: #ffffff;
  
  /* 功能色 */
  --success: #52c41a;
  --danger: #ff4d4f;
  --warning: #faad14;
  --info: #1890ff;
  
  /* 边框 */
  --border: #e8e8e8;
  
  /* 阴影 */
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.12);
  
  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 24px;
  
  /* 字体 */
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-size-base: 14px;
  --font-size-sm: 12px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;
  --font-size-xxl: 24px;
}
```

### 组件样式规范

**输入框**
```css
.form-control {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-input);
  border: none;
  border-radius: var(--radius-full);
  font-size: var(--font-size-base);
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s;
}

.form-control::placeholder {
  color: var(--text-placeholder);
}

.form-control:focus {
  background: #ebebeb;
}
```

**按钮**
```css
/* 主按钮 */
.btn-primary {
  background: var(--primary);
  color: var(--text-white);
  border: none;
  border-radius: var(--radius-full);
  padding: 12px 24px;
  font-size: var(--font-size-base);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: var(--primary-hover);
}

/* 次要按钮 */
.btn-secondary {
  background: var(--bg-input);
  color: var(--text-primary);
  border: none;
  border-radius: var(--radius-full);
  padding: 12px 24px;
  font-size: var(--font-size-base);
  cursor: pointer;
}

/* 危险按钮 */
.btn-danger {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  padding: 4px 12px;
  font-size: var(--font-size-sm);
}
```

**卡片**
```css
.card {
  background: var(--bg-body);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 24px;
}
```

**标签**
```css
.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.tag-primary { background: #e6f7ff; color: var(--primary); }
.tag-success { background: #f6ffed; color: var(--success); }
.tag-danger { background: #fff2f0; color: var(--danger); }
.tag-default { background: #f5f5f5; color: var(--text-secondary); }
```

### 页面布局规范

**认证页面（登录/注册/忘记密码）**
- 背景：白色
- 卡片：居中，最大宽度 `400px`，圆角 `12px`，阴影
- 标题：`24px`，黑色，居中
- 副标题：`14px`，灰色，居中
- 表单：垂直排列，间距 `16px`
- 按钮：全宽，蓝色

**管理后台**
- 顶部导航栏：黑色背景 `#1a1a1a`，高度 `56px`
- 左侧边栏：白色背景，宽度 `200px`
- 主内容区：浅灰背景 `#f5f5f5`，内边距 `24px`
- 表格：白色卡片，圆角，无外边框

**会员购买页**
- 三栏卡片布局
- 推荐卡片：蓝色边框高亮
- 价格：大号字体 `32px`
- 功能列表：蓝色勾选图标

## 文件变更

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/views/layout.ts` | 重写 | CSS 变量 + 导航栏 + 侧边栏 |
| `src/views/auth.ts` | 重写 | 登录/注册/忘记密码样式 |
| `src/views/user.ts` | 重写 | 实例列表/会员购买/个人中心 |
| `src/views/admin.ts` | 重写 | 管理后台所有页面 |
