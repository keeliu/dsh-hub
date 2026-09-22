# Spec: 页面与 API 重复逻辑统一

## Feature: 用户创建统一

### Scenario: 页面注册使用业务层函数
- GIVEN 用户通过页面表单注册
- WHEN POST /register 处理
- THEN 调用 `createUserRow(db, opts)` 创建用户
- AND slug 由 `generateSlug()` 生成（含撞名处理）
- AND dir_name 由 `sanitizeNickname()` 生成（含净化和撞名处理）

### Scenario: 管理后台创建用户使用业务层函数
- GIVEN 管理员通过页面表单创建用户
- WHEN POST /admin/users 处理
- THEN 调用 `createUserRow(db, opts)` 创建用户
- AND 不再出现内联 INSERT SQL

## Feature: 登录逻辑统一

### Scenario: 页面登录使用统一函数
- GIVEN 用户通过页面表单登录
- WHEN POST /login 处理
- THEN 调用 `attemptLogin(db, account, password, ip, ua)` 函数
- AND 该函数包含 dummy hash、限速、审计等完整逻辑

## Feature: 封禁逻辑统一

### Scenario: 页面封禁用户使用统一函数
- GIVEN 管理员点击封禁按钮
- WHEN POST /admin/users/:id/disable 处理
- THEN 调用 `disableUser(db, userId)` 函数
- AND 该函数包含停实例 + 吊销 session + 吊销 token 完整链路

## Feature: 配置读取统一

### Scenario: 页面模块不直接访问 process.env
- GIVEN 任何页面路由代码
- WHEN 需要读取配置值
- THEN 通过 `config` 单例获取
- AND 不直接访问 `process.env`
