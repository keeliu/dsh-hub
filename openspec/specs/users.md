# 用户管理规范

> 状态：已实现（M1 + M2.1 安全修复）
> 模块：`src/users.ts`、`src/api.ts`（管理路由）

## Requirement: 角色体系

系统定义三级角色，权限逐级递增。

Scenario: 角色定义
- GIVEN 系统角色体系
- THEN 支持 `root`、`admin`、`user` 三级
- AND root 可管理所有角色（包括 admin）
- AND admin 只能管理 user
- AND user 无管理权

Scenario: canManage 权限检查
- GIVEN actor=root, target=user → 可管理
- GIVEN actor=root, target=admin → 可管理
- GIVEN actor=admin, target=user → 可管理
- GIVEN actor=admin, target=admin → 不可管理
- GIVEN actor=user, target=any → 不可管理

## Requirement: 昵称与目录名

用户昵称保留 Unicode（中文可用），同时生成 ASCII slug 和目录名。

Scenario: 昵称净化规则
- WHEN nickname 包含 `/`、控制字符、首尾空白、前导 `.`
- THEN 这些字符被剔除
- AND 结果截断至 ≤64 字节（UTF-8 安全截断，不切半字符）

Scenario: 空昵称拒绝
- WHEN nickname 净化后为空
- THEN 返回 400 `invalid_nickname`（不回退随机名）

Scenario: slug 生成
- GIVEN nickname = "Alice"
- THEN slug = "alice"（ASCII 降序规范化）

Scenario: 中文昵称 slug 回退
- GIVEN nickname = "张三"
- THEN slug = "u-<random8>"（无音译零依赖实现）

Scenario: slug 冲突处理
- GIVEN slug "alice" 已被占用
- WHEN 新用户 slug 也为 "alice"
- THEN 追加 "-2"、"-3"… 直到唯一

Scenario: dir_name 生成
- GIVEN nickname 净化后非空
- THEN dir_name = 净化后的昵称（中文直接作目录名）

Scenario: dir_name 冲突处理
- GIVEN dir_name "张三" 已被占用
- WHEN 新用户 dir_name 也为 "张三"
- THEN 追加 "-2"、"-3"… 直到唯一

Scenario: dir_name 兜底
- GIVEN nickname 净化后为空（已被 400 拦截，此处为防御性设计）
- THEN dir_name = "user-<random8>"

## Requirement: 昵称目录

用户创建成功后，在数据根下创建以其 dir_name 命名的目录。

Scenario: 目录创建
- GIVEN 用户创建成功
- THEN `users/<dir_name>/` 目录存在
- AND 权限为 700（仅属主可访问）

Scenario: 幂等创建
- WHEN 多次调用 ensureUserDir
- THEN 不报错，目录权限保持 700

## Requirement: 管理员用户 CRUD

管理员（admin/root）可创建、查看、修改其他用户。

Scenario: 管理员创建用户
- GIVEN actor 为 admin 或 root
- WHEN 发送 `POST /admin/api/users` 提供 nickname、password、可选 role/email/配额
- THEN 创建用户并返回

Scenario: admin 不能创建 admin/root
- GIVEN actor 为 admin
- WHEN 尝试创建 role=admin 的用户
- THEN 返回 403 `forbidden`

Scenario: root 可创建任何角色
- GIVEN actor 为 root
- WHEN 创建 role=admin 的用户
- THEN 成功

Scenario: 查看用户列表
- GIVEN actor 为 admin 或 root
- WHEN 发送 `GET /admin/api/users`
- THEN 返回所有用户（不含 password_hash）

Scenario: 查看单个用户
- GIVEN actor 为 admin 或 root
- WHEN 发送 `GET /admin/api/users/:id`
- THEN 返回该用户信息

## Requirement: 用户修改

管理员可修改用户的状态、角色、密码、配额。

Scenario: 禁用用户
- GIVEN actor 为 admin 或 root
- WHEN PATCH 设置 status=disabled
- THEN 用户 status 变为 disabled
- AND 该用户所有运行中的实例被停止
- AND 该用户所有会话被删除
- AND 该用户所有 API token 被吊销

Scenario: 启用用户
- WHEN PATCH 设置 status=active
- THEN 用户 status 变为 active

Scenario: 修改角色
- GIVEN actor=root
- WHEN PATCH 设置 role=admin
- THEN 用户角色变更

Scenario: 重置密码
- WHEN PATCH 提供新 password
- THEN 密码哈希更新
- AND 该用户所有会话被删除
- AND 该用户所有 API token 被吊销

Scenario: 修改配额
- WHEN PATCH 提供 max_instances 或 max_running
- THEN 配额更新（范围 0-1000）

Scenario: 不能改自己的 status/role
- GIVEN actor 尝试修改自己的 status 或 role
- WHEN 发送 PATCH
- THEN 返回 403 `forbidden`（防 root 自杀、admin 自降级）

## Requirement: 密码哈希

系统使用 Node 内置 scrypt 进行密码哈希，零依赖。

Scenario: 哈希参数
- WHEN 密码被哈希
- THEN 使用 scrypt（N=32768, r=8, p=1, maxmem=64MiB）
- AND 格式为 `scrypt$N$r$p$maxmem$<saltB64>$<hashB64>`

Scenario: 校验密码
- GIVEN 存储的哈希和输入密码
- WHEN 校验
- THEN 使用 timingSafeEqual 比较（恒定耗时）

Scenario: 损坏格式处理
- GIVEN 存储的哈希格式损坏
- WHEN 校验
- THEN 返回 false（不抛错）
