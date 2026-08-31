# 数据模型规范

> 状态：已实现（M1 + M2 + M2.1）
> 模块：`src/db.ts`
> 数据库：SQLite（node:sqlite 内置，WAL 模式）

## Requirement: 数据库初始化

Scenario: 数据根创建
- GIVEN DSH_HUB_DATA 环境变量或默认路径
- WHEN openDb() 被调用
- THEN 数据根目录被创建（权限 700）
- AND DB 文件 dshhub.db 被创建（权限 600）

Scenario: WAL 模式
- WHEN DB 打开
- THEN `PRAGMA journal_mode = WAL`
- AND `PRAGMA foreign_keys = ON`

Scenario: 幂等建表
- WHEN migrate() 被调用
- THEN 所有表使用 CREATE TABLE IF NOT EXISTS
- AND 可安全重复执行

## Requirement: users 表

用户账号信息。

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  nickname TEXT UNIQUE NOT NULL,       -- 显示名与登录名（Unicode）
  slug TEXT UNIQUE NOT NULL,           -- URL/子域标签（ASCII [a-z0-9-]）
  dir_name TEXT UNIQUE NOT NULL,       -- 目录名（净化后的昵称）
  email TEXT UNIQUE,                   -- 可选邮箱
  password_hash TEXT NOT NULL,         -- scrypt 自描述格式
  role TEXT NOT NULL CHECK(role IN ('user','admin','root')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  max_instances INTEGER NOT NULL DEFAULT 3,   -- 最大实例数
  max_running INTEGER NOT NULL DEFAULT 1,     -- 最大并发运行数
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
```

Scenario: 昵称唯一
- WHEN 插入重复 nickname
- THEN UNIQUE 约束拒绝

Scenario: slug 唯一
- WHEN 插入重复 slug
- THEN UNIQUE 约束拒绝

Scenario: dir_name 唯一
- WHEN 插入重复 dir_name
- THEN UNIQUE 约束拒绝

Scenario: 角色约束
- WHEN 插入 role 不在 ('user','admin','root') 中
- THEN CHECK 约束拒绝

Scenario: 状态约束
- WHEN 插入 status 不在 ('active','disabled') 中
- THEN CHECK 约束拒绝

## Requirement: sessions 表

服务端会话存储。

```sql
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,         -- SHA-256(token)，DB 不存明文
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,         -- 滑动过期时间戳
  created_at INTEGER NOT NULL,         -- 创建时间戳（绝对上限用）
  ip TEXT,                             -- 登录 IP
  ua TEXT                              -- 登录 User-Agent
);
```

Scenario: 级联删除
- WHEN 用户被删除
- THEN 该用户所有会话自动删除（ON DELETE CASCADE）

Scenario: 滑动续期
- WHEN 会话校验命中
- THEN expires_at 更新为 now + 7 天

Scenario: 绝对上限
- GIVEN now - created_at > 30 天
- WHEN 会话校验
- THEN 会话失效并删除

## Requirement: api_tokens 表

长期 API token。

```sql
CREATE TABLE api_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- token 名称（用户自定义）
  token_hash TEXT NOT NULL,            -- SHA-256(token)
  created_at INTEGER NOT NULL,
  revoked_at INTEGER                   -- 吊销时间戳（null = 有效）
);
```

Scenario: 吊销标记
- WHEN token 被吊销
- THEN revoked_at 设置为当前时间戳

Scenario: 有效 token 判定
- GIVEN revoked_at IS NULL
- THEN token 有效

## Requirement: instances 表

dsh web 实例信息。

```sql
CREATE TABLE instances (
  id TEXT PRIMARY KEY,                 -- 短随机 ID（i-xxxxxxxx）
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- 实例名称
  port INTEGER UNIQUE,                 -- 分配的回环端口
  home_path TEXT,                      -- DSH_HOME 路径
  workspace_path TEXT,                 -- 工作区路径
  harness_version TEXT,                -- dsh 版本（null = 系统默认）
  trusted_host TEXT,                   -- trusted-host 值
  status TEXT NOT NULL DEFAULT 'stopped',  -- stopped/starting/running/stopping/failed
  pid INTEGER,                         -- 进程 PID
  auto_restart INTEGER NOT NULL DEFAULT 0,  -- M5 预留
  mem_max_mb INTEGER,                  -- M5 预留
  cpu_quota_pct INTEGER,               -- M5 预留
  created_at INTEGER NOT NULL,
  last_started_at INTEGER
);
```

Scenario: 端口唯一
- WHEN 两个实例分配同一端口
- THEN UNIQUE 约束拒绝

Scenario: 级联删除
- WHEN 用户被删除
- THEN 该用户所有实例自动删除

## Requirement: audit_logs 表

审计日志。

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER,                    -- 操作者 ID（可为 null）
  target_user_id INTEGER,              -- 目标用户 ID（可为 null）
  action TEXT NOT NULL,                -- 动作类型
  detail TEXT,                         -- 详细信息
  created_at INTEGER NOT NULL
);
```

Scenario: 审计动作类型
- THEN 支持以下动作：
  - setup, register, login, login_failed, logout
  - token_issue, token_revoke
  - user_create, user_update, user_disable, user_enable, password_reset
  - instance_create, instance_start, instance_stop, instance_restart, instance_delete, instance_admin

## Requirement: settings 表

全局键值设置。

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Scenario: 已知设置键
- THEN 支持以下键：
  - `registration_open` — "open" | "closed"（默认 closed）
  - `default_harness_version` — 默认 dsh 版本（空 = 不限）
  - `allowed_harness_versions` — 逗号分隔版本白名单（空 = 不限）
  - `route_mode` — M3 预留
  - `credential_mode` — M3 预留

Scenario: UPSERT
- WHEN setSetting() 被调用
- THEN 使用 ON CONFLICT DO UPDATE（幂等写入）

## Requirement: 事务辅助

Scenario: withTx 事务
- WHEN withTx(db, fn) 被调用
- THEN 执行 BEGIN IMMEDIATE（立即取写锁）
- AND fn 成功则 COMMIT
- AND fn 抛错则 ROLLBACK 并重新抛出

Scenario: 事务内禁止 await
- GIVEN withTx 回调内
- THEN 不得出现 await（SQLite 事务不能跨事件循环让步）
