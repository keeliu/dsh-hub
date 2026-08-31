# Web UI MVP 功能规范

## Requirement: 首启向导页面

系统首次启动时，管理员可通过网页创建首个管理员账号。

Scenario: 无用户时显示向导
- GIVEN 数据库中没有任何用户
- WHEN 访问任意页面
- THEN 自动重定向到 /setup

Scenario: 向导页面内容
- GIVEN 访问 /setup
- THEN 显示昵称输入框、密码输入框、确认密码输入框
- AND 提交按钮"创建管理员"

Scenario: 创建成功
- GIVEN 填写合法信息并提交
- WHEN 服务端校验通过
- THEN 创建管理员账号
- AND 自动登录（设置 session cookie）
- AND 重定向到 /admin（管理后台首页）

Scenario: 已有用户时拒绝
- GIVEN 数据库中已有用户
- WHEN 访问 /setup
- THEN 重定向到 /login

## Requirement: 登录页面

用户和管理员通过同一登录页面登录。

Scenario: 未登录时显示登录页
- GIVEN 用户未登录
- WHEN 访问受保护页面
- THEN 重定向到 /login

Scenario: 登录页面内容
- GIVEN 访问 /login
- THEN 显示昵称输入框、密码输入框
- AND "登录"按钮
- AND "注册"链接（注册开放时显示）

Scenario: 登录成功（普通用户）
- GIVEN 填写正确凭据
- WHEN 提交登录
- THEN 设置 session cookie
- AND 重定向到 /（用户实例列表）

Scenario: 登录成功（管理员）
- GIVEN 填写正确凭据且角色为 admin/root
- WHEN 提交登录
- THEN 设置 session cookie
- AND 重定向到 /admin（管理后台）

Scenario: 登录失败
- GIVEN 填写错误凭据
- WHEN 提交登录
- THEN 显示错误提示"昵称或密码错误"
- AND 停留在登录页

Scenario: 已登录时访问登录页
- GIVEN 用户已登录
- WHEN 访问 /login
- THEN 根据角色重定向到 / 或 /admin

## Requirement: 注册页面

注册开放时，用户可自行注册。

Scenario: 注册开放时显示注册页
- GIVEN registration_open = "open"
- WHEN 访问 /register
- THEN 显示注册表单（昵称、密码、确认密码）

Scenario: 注册关闭时拒绝
- GIVEN registration_open = "closed"
- WHEN 访问 /register
- THEN 重定向到 /login 并提示"注册已关闭"

Scenario: 注册成功
- GIVEN 填写合法信息
- WHEN 提交注册
- THEN 创建用户账号
- AND 自动登录
- AND 重定向到 /（用户实例列表）

Scenario: 昵称重复
- GIVEN 昵称已被占用
- WHEN 提交注册
- THEN 显示错误提示"昵称已被使用"

## Requirement: 用户实例列表页

用户登录后查看和管理自己的实例。

Scenario: 页面内容
- GIVEN 用户已登录
- WHEN 访问 /
- THEN 显示用户信息（昵称、角色）
- AND 显示实例列表（名称、状态、端口、操作按钮）
- AND "新建实例"按钮
- AND "登出"按钮

Scenario: 空实例列表
- GIVEN 用户没有实例
- WHEN 访问 /
- THEN 显示"暂无实例"提示
- AND 显示"创建第一个实例"按钮

Scenario: 新建实例
- GIVEN 用户点击"新建实例"
- WHEN 填写实例名称并提交
- THEN 创建实例
- AND 刷新列表

Scenario: 启动/停止/重启实例
- GIVEN 实例列表中有操作按钮
- WHEN 点击启动/停止/重启
- THEN 调用对应 API
- AND 刷新实例状态

Scenario: 查看实例详情
- GIVEN 实例列表中有实例
- WHEN 点击实例名称
- THEN 跳转到 /instances/:id

Scenario: 删除实例
- GIVEN 实例已停止
- WHEN 点击删除并确认
- THEN 删除实例
- AND 从列表移除

## Requirement: 用户实例详情页

用户查看实例详细信息和操作。

Scenario: 页面内容
- GIVEN 用户已登录且是实例属主
- WHEN 访问 /instances/:id
- THEN 显示实例信息（名称、状态、端口、版本、trusted_host）
- AND 显示操作按钮（启动/停止/重启/删除）
- AND 显示日志查看区域
- AND "返回列表"链接

Scenario: 查看日志
- GIVEN 实例有日志
- WHEN 页面加载
- THEN 显示最近 200 行日志
- AND "刷新日志"按钮

Scenario: 非属主访问
- GIVEN 实例不属于当前用户
- WHEN 访问 /instances/:id
- THEN 返回 404

## Requirement: 管理后台首页

管理员登录后的仪表盘。

Scenario: 页面内容
- GIVEN admin/root 已登录
- WHEN 访问 /admin
- THEN 显示统计概览（用户数、实例数、运行中实例数）
- AND 导航菜单（首页、用户管理、实例总览、审计日志、设置）
- AND 快捷操作入口

Scenario: 普通用户访问
- GIVEN 用户角色为 user
- WHEN 访问 /admin
- THEN 返回 403

## Requirement: 用户管理页

管理员查看和管理所有用户。

Scenario: 用户列表
- GIVEN admin/root 已登录
- WHEN 访问 /admin/users
- THEN 显示用户表格（昵称、角色、状态、实例数、创建时间）
- AND 每行有操作按钮（编辑、封禁/启用）

Scenario: 创建用户
- GIVEN 管理员点击"创建用户"
- WHEN 填写信息并提交
- THEN 创建用户
- AND 刷新列表

Scenario: 编辑用户
- GIVEN 管理员点击编辑
- WHEN 修改角色/配额/密码并提交
- THEN 更新用户信息

Scenario: 封禁/启用用户
- GIVEN 管理员点击封禁/启用
- WHEN 确认操作
- THEN 更新用户状态
- AND 封禁时停止该用户所有实例

## Requirement: 实例总览页

管理员查看所有用户的实例。

Scenario: 实例列表
- GIVEN admin/root 已登录
- WHEN 访问 /admin/instances
- THEN 显示实例表格（属主、名称、状态、端口、版本）
- AND 每行有操作按钮（启动/停止/删除）

Scenario: 跨用户操作
- GIVEN 管理员操作他人实例
- WHEN 启动/停止/删除
- THEN 操作成功
- AND 记录审计日志

## Requirement: 审计日志页

管理员查看系统操作记录。

Scenario: 日志列表
- GIVEN admin/root 已登录
- WHEN 访问 /admin/audit
- THEN 显示审计日志表格（时间、操作者、动作、详情）
- AND 按时间倒序
- AND 分页（每页 50 条）

## Requirement: 全局设置页

管理员修改系统设置。

Scenario: 设置表单
- GIVEN admin/root 已登录
- WHEN 访问 /admin/settings
- THEN 显示设置表单：
  - 注册开关（open/closed）
  - 默认 dsh 版本
  - 允许的版本列表（逗号分隔）

Scenario: 保存设置
- GIVEN 修改设置
- WHEN 点击保存
- THEN 更新设置
- AND 显示"保存成功"提示

## Requirement: 页面布局与样式

Scenario: 公共布局
- GIVEN 任何页面
- THEN 顶部导航栏（logo、用户信息、登出）
- AND 主内容区域
- AND 简洁的 CSS 样式（无外部依赖）

Scenario: 响应式基础
- GIVEN 页面在移动端访问
- THEN 基本可用（不要求完美适配）

Scenario: 错误提示
- GIVEN 操作失败
- THEN 显示红色错误提示框

Scenario: 成功提示
- GIVEN 操作成功
- THEN 显示绿色成功提示框
