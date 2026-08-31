# 架构与代码规范

> 状态：生效中（基于 M2.1 代码审查提炼）
> 适用范围：所有后续功能变更的提案、设计、实现
> 约束级别：标注「强制」的条目必须遵守；标注「建议」的条目在无理由反驳时应遵守

---

## 1 分层架构（强制）

依赖方向只能自上而下，禁止反向引用和同层循环依赖。

| 层 | 模块 | 职责 |
|---|---|---|
| 入口 | `index.ts` | 启动、孤儿认领、优雅关闭 |
| 路由 | `api.ts`、`pages.ts`、`gateway.ts` | 路由注册、参数提取、响应格式化 |
| 业务 | `auth.ts`、`instances.ts`、`users.ts`、`sessions.ts`、`supervisor.ts`、`settings.ts` | 业务逻辑、权限校验、配额控制 |
| 基础 | `db.ts`、`http.ts`、`config.ts`、`pwd.ts`、`port.ts`、`paths.ts`、`version.ts`、`email.ts` | 数据库、HTTP 工具、配置、密码、端口、路径 |

规则：
- 基础层模块之间不互相引用（`http.ts` 读 `config.ts` 除外）。
- 业务层模块之间允许单向引用，禁止循环依赖。
- 路由层是唯一的组装点，不被任何模块引用（入口层除外）。

## 2 文件体量（强制）

| 文件类型 | 行数上限 | 超限处理 |
|---|---|---|
| 路由注册文件 | 300 行 | 按领域拆分为 `routes/auth.ts`、`routes/instances.ts`、`routes/admin.ts` 等 |
| 业务逻辑文件 | 400 行 | 拆分为子模块目录（如 `supervisor/spawn.ts`、`supervisor/stop.ts`） |
| 视图模板文件 | 300 行 | 按页面拆分（如 `views/admin-users.ts`） |

## 3 安全规范

### 3.1 Cookie 名称（强制）

所有 cookie 名称必须从 `sessions.ts` 导入常量（`SESSION_COOKIE`、`CSRF_COOKIE`），禁止硬编码字符串。

### 3.2 CSRF 全覆盖（强制）

所有写操作（POST/PATCH/DELETE/PUT），无论 API 路由还是页面路由，必须执行 CSRF 校验。页面表单必须嵌入 CSRF token。

### 3.3 身份标识一致性（强制）

URL 路径中使用 `slug`（ASCII [a-z0-9-]）作为用户标识，不使用 `dir_name`。所有权校验链路：URL slug → `users.slug` → `user.id` → `instances.owner_id`。禁止通过 `dir_name` 做路径路由的身份匹配。

### 3.4 信息泄露防护（强制）

- 用户不存在时执行 dummy hash（消除时间侧信道）。
- 未知资源返回 404（不泄露存在性）。
- 找回密码不提示邮箱是否已注册。
- 错误响应不暴露内部路径或堆栈。

### 3.5 同步/异步一致性（强制）

同步函数不加 `await`，异步函数必须加。函数签名变更后所有调用点必须同步更新。

## 4 逻辑去重（强制）

### 4.1 单一真相源

每个业务操作只有一个实现，放在业务层。API 路由和页面路由都调用同一个业务函数，区别仅在响应格式（JSON vs HTML redirect）。

### 4.2 配置读取统一

除 `config.ts` 外，任何模块不得直接访问 `process.env`。所有配置通过 `config` 单例获取。

### 4.3 鉴权逻辑复用

网关（`gateway.ts`）的鉴权必须复用 `auth.ts` 的 `authenticate()`，禁止独立维护第二套鉴权解析逻辑。

## 5 代理与网关

### 5.1 HTTP 代理流式转发（强制）

HTTP 代理必须使用流式转发（ReadableStream pipe），禁止将整个响应体读入内存后一次性发送。

### 5.2 WebSocket 代理关闭帧（建议）

upstream error 时应发送 WebSocket close frame（1011 Internal Error）后再关闭连接。

## 6 数据库规范

### 6.1 Schema 迁移版本化（建议）

引入 `schema_version` 表，迁移按版本号顺序执行幂等 SQL 脚本，替代当前的 `try/catch ALTER TABLE` 方式。

### 6.2 查询结果类型安全（建议）

对 `db.prepare().all() as unknown as T[]` 模式，引入 row mapper 函数在运行时校验关键字段存在。

## 7 进程管理

### 7.1 supervisor 拆分（建议）

按关注点拆分为 `supervisor/spawn.ts`、`stop.ts`、`reclaim.ts`、`lock.ts`、`pidfile.ts`、`log.ts`、`probe.ts`。

### 7.2 状态机形式化（建议）

实例状态转换用显式状态机约束（`VALID_TRANSITIONS` 表），禁止在多处散落字符串字面量状态转换。

## 8 代码工艺

### 8.1 注释（强制）

- 模块头部注释必须包含职责、关键设计决策、关联文档编号。
- 函数注释仅在「为什么」不显而易见时写一行。
- 安全修复用 `Mx.Bx` 格式标注，方便追溯。
- 禁止注释掉的代码和过时的 TODO。

### 8.2 错误处理（强制）

- 业务错误一律抛 `HttpError`（status + code + message）。
- 系统错误在业务层 catch 并转为 `HttpError` 或结构化结果。
- 禁止 `catch { console.error(e); }` 后继续执行（轮转/清理等非关键路径除外）。

### 8.3 常量命名（强制）

所有影响行为的数值必须命名为常量，放在模块顶部或 `config.ts`。禁止函数体内出现未命名的数字常量（0、1、-1 等惯用值除外）。

### 8.4 类型导出（强制）

跨模块使用的核心类型（如 `InstanceRecord`、`UserRow`）在定义模块导出，内部类型不导出。类型膨胀时考虑提取到 `types.ts`。

## 9 测试与验证

- 每个新功能必须附带冒烟测试用例。
- 安全修复必须附带回归测试（放入 `security-regression.sh`）。
- 每次提交前必须通过 `tsc -p . --noEmit`。
- API 端点目标覆盖率：每个路由至少一个正向 + 一个异常用例。

## 10 近期行动清单

| 优先级 | 项目 | 对应章节 |
|---|---|---|
| P0 | 修复 gateway.ts session cookie 名称（`session_id` → `SESSION_COOKIE`） | §3.1 |
| P0 | 修复 verifyInstanceOwnership 身份标识（dir_name → slug） | §3.3 |
| P1 | 页面表单加 CSRF | §3.2 |
| P1 | 统一 pages.ts 与 api.ts 的重复逻辑 | §4.1 |
| P1 | gateway 鉴权复用 auth.ts | §4.3 |
| P2 | 拆分 api.ts / pages.ts 为 routes/* | §2 |
| P2 | 拆分 supervisor.ts | §7.1 |
| P3 | HTTP 代理改流式 | §5.1 |
| P3 | Schema 迁移版本化 | §6.1 |
| P3 | 实例状态机形式化 | §7.2 |
