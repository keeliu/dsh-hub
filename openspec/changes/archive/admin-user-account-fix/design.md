# 设计文档：管理后台用户账号字段显示 + 管理员登录修复

## 概述

本变更解决两个问题：
1. 管理后台用户列表缺少账号字段
2. 管理员登录后无法进入管理后台

## 技术方案

### 1. 用户列表增加账号字段

**修改文件**: `views/admin.ts`

在 `renderAdminUsers` 函数中，用户列表表格增加"账号"列：

```html
<table>
  <thead>
    <tr>
      <th>昵称</th>
      <th>账号</th>  <!-- 新增 -->
      <th>邮箱</th>
      <th>角色</th>
      <th>状态</th>
      <th>操作</th>
    </tr>
  </thead>
  <tbody>
    <!-- 用户数据 -->
  </tbody>
</table>
```

### 2. 登录成功后根据角色跳转

**修改文件**: `pages.ts`

在登录处理逻辑中，登录成功后根据用户角色决定跳转目标：

```typescript
// 登录成功后
const redirectUrl = user.role === 'user' ? '/' : '/admin';
sendRedirect(res, redirectUrl);
```

### 3. 导航栏显示管理后台入口

**修改文件**: `views/layout.ts`

在导航栏中根据用户角色显示"管理后台"链接：

```html
<nav>
  <!-- 其他导航项 -->
  ${user.role !== 'user' ? '<a href="/admin">管理后台</a>' : ''}
</nav>
```

## 数据流

```
登录请求 → api.ts (login) → 返回用户信息（含 role）
    ↓
pages.ts (POST /login) → 根据 role 决定跳转
    ↓
admin/user → 对应页面
```

## 安全考虑

1. 管理后台入口仅对 admin/root 角色显示
2. 登录跳转需校验 redirect 参数的权限
3. 用户列表 API 已返回 username 字段，无需修改

## 测试要点

1. 管理员登录后跳转到 `/admin`
2. 普通用户登录后跳转到 `/`
3. 用户列表显示账号字段
4. 导航栏根据角色显示管理后台入口
