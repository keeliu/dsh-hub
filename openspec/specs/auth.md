# 认证与会话规范

> 状态：已实现（M1 + M2.1 安全修复）
> 模块：`src/auth.ts`、`src/sessions.ts`、`src/pwd.ts`

## Requirement: 首启向导

系统首次启动且数据库中无任何用户时，允许通过 setup 接口创建首个管理员账号。

Scenario: 无用户时创建管理员
- GIVEN 数据库中没有任何用户
- WHEN 发送 `POST /api/auth/setup` 并提供合法的 nickname 和 password（≥8 字符）
- THEN 创建一个 role=admin 的用户，自动建立会话并返回 session cookie

Scenario: 已有用户时拒绝 setup
- GIVEN 数据库中已存在至少一个用户
- WHEN 发送 `POST /api/auth/setup`
- THEN 返回 403 `setup_closed`

Scenario: 并发 setup 只创建一个管理员
- GIVEN 数据库中没有任何用户
- WHEN 两个 setup 请求并发到达
- THEN 仅一个成功（200），另一个返回 403（事务串行化）

## Requirement: 用户注册

系统提供注册功能，默认关闭，管理员可通过设置开启。

Scenario: 注册开放时成功注册
- GIVEN `registration_open` 设置为 `open`
- WHEN 发送 `POST /api/auth/register` 并提供合法 nickname 和 password
- THEN 创建 role=user 的用户，自动建立会话

Scenario: 首位注册用户自动 root
- GIVEN 注册开放且数据库中无任何用户（未经 setup）
- WHEN 首个注册请求到达
- THEN 该用户 role=root（兜底机制）

Scenario: 注册关闭时拒绝
- GIVEN `registration_open` 为 `closed`（默认）
- WHEN 发送 `POST /api/auth/register`
- THEN 返回 403 `registration_closed`

Scenario: 注册限速
- GIVEN 注册开放
- WHEN 同一 IP 连续注册失败 5 次
- THEN 第 6 次返回 429 `login_locked`，锁定 15 分钟

Scenario: 昵称重复
- GIVEN 已存在 nickname=alice 的用户
- WHEN 新注册请求 nickname=alice
- THEN 返回 409 `nickname_taken`

Scenario: 空昵称拒绝
- WHEN nickname 净化后为空字符串
- THEN 返回 400 `invalid_nickname`

## Requirement: 登录

用户通过昵称和密码登录，获取会话 cookie。

Scenario: 正确凭据登录成功
- GIVEN 存在活跃用户 alice
- WHEN 发送 `POST /api/auth/login` 并提供正确密码
- THEN 返回 200，设置 session cookie（HttpOnly + SameSite=Lax），记录审计日志

Scenario: 错误凭据登录失败
- WHEN 密码错误
- THEN 返回 401 `bad_credentials`，记录失败次数

Scenario: 禁用账号登录失败
- GIVEN 用户 status=disabled
- WHEN 尝试登录
- THEN 返回 403 `disabled`

Scenario: 登录限速
- GIVEN 同一 IP+昵称连续登录失败 5 次
- WHEN 第 6 次尝试
- THEN 返回 429 `login_locked`，锁定 15 分钟

Scenario: 限速键双维度
- GIVEN 攻击者从 IP-A 对 alice 失败 4 次
- WHEN 从 IP-B 对 alice 再失败 1 次
- THEN 触发锁定（键 = `${ip}|${nickname}`，同一昵称不同 IP 独立计数）

Scenario: 锁过期后计数归零
- GIVEN 锁定已过期（>15 分钟）
- WHEN 再次失败
- THEN 从第 1 次重新计数（防止永久续锁）

Scenario: 时间侧信道防护
- WHEN 登录不存在的用户
- THEN 仍执行一次同参数 scrypt 哈希（与存在用户耗时一致），消除用户名枚举

## Requirement: 登出

Scenario: 登出清除会话
- GIVEN 用户已登录
- WHEN 发送 `POST /api/auth/logout`（需 CSRF token）
- THEN 删除 session 记录，清除 cookie

## Requirement: 会话管理

系统使用服务端 session，cookie 仅存随机 token。

Scenario: 会话滑动续期
- GIVEN 有效会话（7 天内）
- WHEN 请求命中会话校验
- THEN expires_at 顺延 7 天

Scenario: 会话绝对上限
- GIVEN 会话创建超过 30 天
- WHEN 请求到达
- THEN 会话失效，需重新登录

Scenario: 会话数上限
- GIVEN 某用户已有 20 个活跃会话
- WHEN 创建新会话
- THEN 逐出最旧的会话（防 sessions 表膨胀）

Scenario: DB 仅存 token 哈希
- WHEN 创建会话
- THEN DB 中存储 SHA-256(token)，明文 token 仅通过 Set-Cookie 返回

## Requirement: CSRF 防护

所有通过会话鉴权的写操作必须携带 CSRF token。

Scenario: 会话鉴权写操作需 CSRF
- GIVEN 用户通过 session cookie 鉴权
- WHEN 发送写操作请求（POST/PATCH/PUT/DELETE）
- THEN 必须携带 `X-CSRF-Token` 头，值与 CSRF cookie 一致（timingSafeEqual 比较）
- AND 不匹配时返回 403 `csrf_failed`

Scenario: Bearer 鉴权免 CSRF
- GIVEN 用户通过 Bearer token 鉴权
- WHEN 发送写操作请求
- THEN 不要求 CSRF token

## Requirement: API Token 双轨

用户可签发长期 API token 供脚本调用。

Scenario: 签发 token
- GIVEN 用户已登录
- WHEN 发送 `POST /api/me/tokens` 并提供 name
- THEN 返回 token（`dsh_` 前缀 + 24 字节 hex），仅此一次明文返回

Scenario: Bearer token 鉴权
- GIVEN 有效且未吊销的 token
- WHEN 请求携带 `Authorization: Bearer dsh_xxx`
- THEN 鉴权成功，等价于该用户的会话

Scenario: 吊销 token
- WHEN 发送 `POST /api/me/tokens/:id/revoke`
- THEN token 标记 revoked_at，后续请求鉴权失败

Scenario: 封禁时吊销全部 token
- GIVEN 用户被封禁（status → disabled）
- THEN 该用户所有未吊销的 token 自动设置 revoked_at
