# Proposal: 页面与 API 重复逻辑统一

## Why

当前 `pages.ts` 和 `api.ts` 各自独立实现了多组相同的业务逻辑，且实现不一致：

| 逻辑 | api.ts 实现 | pages.ts 实现 | 差异 |
|---|---|---|---|
| slug 生成 | `generateSlug(nickname, taken)` | 内联 `nickname.toLowerCase().replace(...)` | pages 版无撞名处理 |
| 用户创建 | `createUserRow(db, opts)` | 内联 INSERT SQL | pages 版无 nickname 净化 |
| dir_name 生成 | `sanitizeNickname` + 撞名追加 `-2` | 直接用 nickname | pages 版无净化和撞名处理 |
| 登录 | `getUserByAccount` + dummy hash | 同样逻辑（重复代码） | 逻辑一致但代码重复 |
| 封禁用户 | 停实例 + 吊销 session + 吊销 token | 同样逻辑（重复代码） | 逻辑一致但代码重复 |
| 注册后自动建实例 | 无 | pages.ts 独有 | 仅页面有 |

这种重复导致：
- 修复一处容易遗漏另一处（如 pages 版的 slug 生成不处理撞名）。
- 新增校验逻辑需要在两处同步修改。
- 代码量膨胀，维护成本翻倍。

## What Changes

### 1. pages.ts 的 POST handler 统一调用业务层函数

- 用户创建 → `createUserRow(db, opts)`
- slug 生成 → `generateSlug(nickname, taken)`
- 登录 → 提取为 `attemptLogin(db, account, password, ip, ua)` 函数
- 封禁 → 提取为 `disableUser(db, userId)` 函数

### 2. 消除 pages.ts 中的内联 SQL

pages.ts 中直接出现的 `db.prepare('INSERT INTO users ...')` 全部替换为业务层函数调用。

### 3. 注册后自动建实例逻辑归位

将 pages.ts 中的「注册后自动创建并启动实例」逻辑提取到业务层函数 `postRegisterActions(db, user)` 中，API 和页面路由共享。

## Impact

- **破坏性**：无。行为不变，只是消除重复。
- **影响范围**：`src/pages.ts`（大幅瘦身）、`src/auth.ts`（新增 `attemptLogin`）、`src/users.ts`（新增 `disableUser`）
- **风险**：中。改动面较广，需要逐一验证每个 POST handler 的行为不变。
