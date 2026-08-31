# 安全机制规范

> 状态：已实现（M2.1 安全修复 + 结构优化）
> 模块：`src/auth.ts`、`src/version.ts`、`src/api.ts`、`src/supervisor.ts`

## Requirement: 封禁链路

用户被封禁时，系统必须彻底切断其所有访问途径。

Scenario: 封禁即停实例
- GIVEN 用户有运行中的实例
- WHEN 管理员设置 status=disabled
- THEN 该用户所有 running/starting 实例被停止

Scenario: 封禁即吊销会话
- GIVEN 用户有活跃会话
- WHEN 被封禁
- THEN sessions 表中该用户所有记录被删除

Scenario: 封禁即吊销 token
- GIVEN 用户有未吊销的 API token
- WHEN 被封禁
- THEN 所有 token 设置 revoked_at

Scenario: 禁用账号无法鉴权
- GIVEN 用户 status=disabled
- WHEN 使用其会话 cookie 或 API token 请求
- THEN authenticate() 返回 null（视为未鉴权）

Scenario: 管理员不可自改 status
- GIVEN actor=root
- WHEN 尝试修改自己的 status
- THEN 返回 403 `forbidden`（防 root 自杀导致系统不可管理）

## Requirement: 版本白名单

harness_version 字段必须严格限制，防止 RCE 注入。

Scenario: 合法 semver 放行
- GIVEN version = "0.1.1-rc.2"
- WHEN 校验
- THEN 通过（匹配 `/^\d{1,3}\.\d{1,3}\.\d{1,3}([-+][0-9A-Za-z.-]{1,32})?$/`）

Scenario: 非法 spec 拒绝
- GIVEN version = "file:../evil" 或 "github:user/repo" 或 "latest" 或 "^0.1.0"
- WHEN 校验
- THEN 返回 400 `invalid_harness_version`

Scenario: 白名单精确匹配
- GIVEN `allowed_harness_versions` = "0.1.1,0.1.2"
- WHEN 请求 version="0.1.1"
- THEN 放行

Scenario: 白名单外版本拒绝
- GIVEN `allowed_harness_versions` = "0.1.1,0.1.2"
- WHEN 请求 version="0.1.3"
- THEN 返回 403 `harness_version_not_allowed`

Scenario: 空白名单不限制
- GIVEN `allowed_harness_versions` 为空或未设置
- WHEN 请求任何合法 semver
- THEN 放行

Scenario: 白名单含非法项则整体失效
- GIVEN `allowed_harness_versions` = "0.1.1,latest"
- WHEN 解析
- THEN 返回 null（视为未配置，全部合法 semver 放行）

Scenario: 双层校验
- WHEN 创建实例
- THEN API 层校验 + supervisor 层校验（双层防护）

## Requirement: 并发互斥

实例写操作必须互斥，防止竞态。

Scenario: per-instance 互斥
- GIVEN 实例 i-abc 正在执行 start
- WHEN 另一个 start/stop/restart/delete 请求到达
- THEN 返回 409 `instance_busy`

Scenario: 操作完成释放
- GIVEN 操作完成（成功或失败）
- WHEN 下一个请求到达
- THEN 可正常执行

Scenario: 配额事务化
- GIVEN 两个创建实例请求并发
- WHEN 配额恰好够一个
- THEN BEGIN IMMEDIATE 串行化，仅一个成功

## Requirement: 进程安全

Scenario: spawn error 不崩溃 hub
- GIVEN dsh 二进制不存在
- WHEN spawn 触发 error 事件（ENOENT）
- THEN 错误被捕获处理
- AND hub 进程不崩溃

Scenario: 运行期 exit 同步 DB
- GIVEN 实例运行中 dsh 进程崩溃
- WHEN 检测到 exit 事件
- THEN DB 中 status 更新为 stopped
- AND 不永久占用 max_running 配额

Scenario: 进程身份校验防误杀
- GIVEN pid 被 OS 复用给其他进程
- WHEN 停止或认领实例
- THEN 检查 /proc/<pid>/cmdline 包含 "dsh" 和 "--port <port>"
- AND 不匹配则视为死实例

Scenario: 锁文件持有者校验
- GIVEN 锁文件由 token-A 持有
- WHEN token-B 尝试释放锁
- THEN 释放被拒绝

## Requirement: 登录安全

Scenario: 时间侧信道消除
- GIVEN 用户不存在
- WHEN 登录请求
- THEN 执行 dummy scrypt（与存在用户同参数同耗时）

Scenario: 限速键双维度
- WHEN 登录失败
- THEN 限速键 = `${ip}|${nickname}`
- AND 防止单 IP 爆破和针对昵称的锁死 DoS

Scenario: 锁过期归零
- GIVEN 锁定已过期
- WHEN 再次失败
- THEN 从第 1 次重新计数

## Requirement: 网络与代理安全

Scenario: 客户端 IP 提取
- GIVEN DSH_HUB_TRUST_PROXY=0（默认）
- WHEN 提取客户端 IP
- THEN 使用 socket 对端地址（不信任 X-Forwarded-For）

Scenario: 信任代理模式
- GIVEN DSH_HUB_TRUST_PROXY=1
- WHEN 提取客户端 IP
- THEN 使用 X-Forwarded-For 首个条目

Scenario: Cookie Secure 标记
- GIVEN DSH_HUB_COOKIE_SECURE=1
- WHEN 设置 session cookie
- THEN 添加 Secure 标记（Caddy TLS 后启用）

## Requirement: 数据文件权限

Scenario: 数据根权限
- WHEN 数据根目录被创建
- THEN 权限为 700

Scenario: DB 文件权限
- WHEN DB 文件被创建
- THEN 权限为 600

## Requirement: 审计日志

系统记录所有关键操作的审计日志。

Scenario: 认证事件
- WHEN 发生 setup/register/login/login_failed/logout
- THEN 记录到 audit_logs

Scenario: 用户管理事件
- WHEN 发生 user_create/user_update/user_disable/user_enable/password_reset
- THEN 记录到 audit_logs（含 actor_id 和 target_user_id）

Scenario: 实例事件
- WHEN 发生 instance_create/instance_start/instance_stop/instance_restart/instance_delete
- THEN 记录到 audit_logs

Scenario: 管理员跨用户操作
- GIVEN admin/root 访问他人实例
- WHEN 执行写操作
- THEN 记录 instance_admin 审计

Scenario: 审计查询
- GIVEN actor 为 admin 或 root
- WHEN 发送 `GET /admin/api/audit?limit=200`
- THEN 返回最近 200 条审计记录（按 id 降序）
