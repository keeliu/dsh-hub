# 变更提案：登录/认证与 Workspace 体验修复（auth-workspace-ux-fixes）

> 面向三个生产反馈问题：①Workspace 无限 loading；②注册/密码校验规则与提示不一致；③认证页在部分手机上调不起输入法。
> 本提案**先规范、后代码**。审查通过后再按 `tasks.md` 实施。

## Why（为什么做）

1. **Workspace 无限 Loading**：`GET /` 与登录后都重定向到 `/workspace`；当用户没有 `running` 实例时，`gateway.ts::handleWorkspaceEntry` 返回一个**无超时**的 loading 页（每 2s 轮询 `/api/instances` 并尝试启动实例），实例始终起不来时页面**永远转圈**，且该 loading 页**没有 hub 顶部栏**，用户被困住、无法使用实例管理等功能。
2. **校验规则与提示不一致**：用户名后端为 `^[a-zA-Z0-9_]{3,32}$`（允许下划线、最短 3），注册页提示"3-32位字母数字下划线"；密码后端**只校验长度 ≥8**（无复杂度），前端仅 `minlength="8"`，各处提示不一。业务口径应为：**用户名仅英文字母/数字、>5 位；密码需同时含字母与数字、≥8 位**。
3. **移动端输入法兼容**：认证页 CSS 用 `min-height:100vh` + `display:flex; align-items:center` 居中，移动端键盘弹起后输入框被顶出可视区，部分机型（鸿蒙等）表现为\*\*"调不起输入法"\*\*；并使用了未定义的 `--radius-pill` 变量。

## 认证时效（已确认：不调整）

| 凭据 | 当前时效 | 说明 |
|---|---|---|
| 浏览器会话 cookie | **滑动 7 天**（每次校验命中即顺延）/ **绝对上限 30 天** | 超过绝对上限强制失效；每用户最多 20 个会话（超出逐出最旧） |
| API token（Bearer） | **永不过期**，仅手动吊销 | `api_tokens` 无 expires 字段 |

**已确认：维持现状，不调整**（滑动 7 天 / 绝对 30 天；API token 手动吊销）。后续如需调整，另立变更修改 `SESSION_TTL_MS` / `SESSION_ABSOLUTE_TTL_MS`。

## What Changes（做什么）

### 工作流 1：Workspace 启动超时兜底
- `handleWorkspaceEntry` 的 loading 页：新增 **60s 超时**（常量 `WORKSPACE_START_TIMEOUT_MS`）；超时后停止轮询，进入"启动超时"状态。
- 超时状态**展示 hub 顶部栏**（复用网关已注入的导航或跳转到带导航的页面），并提供：**重试**、**进入实例管理 `/instances`**、**返回首页**。
- 修正"回到首页"落点：当前 `GET /` 会再次重定向到 `/workspace`（回环），故兜底落点用 **`/instances`**（带 hub 顶部栏、可管理/启动实例）。
- 轮询去抖：启动请求只发一次（避免每 2s 重复 `POST .../start`），之后只轮询状态。

### 工作流 2：统一用户名/密码规则与提示
- 在 `users.ts` 提供**单一真相源**校验：
  - `isValidUsername(u)` → `^[a-zA-Z0-9]{6,32}$`（仅英文字母/数字，>5 位、≤32 位）
  - `validatePassword(pw)` → 长度 **≥8**（已确认）且**同时含字母与数字**
- 后端所有密码校验点（`api.ts` setup/register/reset/admin-create/admin-patch、`pages.ts` setup/register/reset）改用 `validatePassword`；用户名校验统一用 `isValidUsername`。
- 前端所有相关表单（`views/auth.ts` 的 setup/register/reset、`views/admin.ts` 建用户）的 `placeholder`/`pattern`/`title`/`minlength` 与错误文案**与后端一致**。
- 提示语统一为：用户名"6-32 位英文字母或数字"；密码"至少 8 位，且同时包含字母和数字"。

### 工作流 3：认证页移动端兼容（通用组件）
- CSS：`min-height: 100vh` → 追加 `100dvh`（保留 100vh 兜底）；`align-items: center` → `flex-start` + 顶部留白 + 允许滚动，保证聚焦输入框滚入可视区。
- 输入组件改为**通用/原生**：标准 `<input type/name/autocomplete/inputmode/pattern/required>`；登录用 `autocomplete="username"` + `current-password`，注册/重置用 `new-password`。
- 移除未定义变量 `--radius-pill`（或补定义），输入框改用标准圆角，避免自造样式导致的兼容问题。
- 覆盖范围：登录/注册/setup/忘记密码/重置密码（以及复用同一样式的后台建用户表单）。

## Impact（影响范围）

- **受影响文件**：
  - `dsh-hub/src/gateway.ts`（loading 页超时 + 顶部栏 + 落点）
  - `dsh-hub/src/users.ts`（`isValidUsername` / `validatePassword`）
  - `dsh-hub/src/api.ts`、`dsh-hub/src/pages.ts`（改调统一校验）
  - `dsh-hub/src/views/auth.ts`、`views/admin.ts`、`views/layout.ts`（提示/属性/CSS）
- **影响功能**：登录/注册/重置密码/建用户校验；Workspace 首次进入体验；认证页移动端可用性。
- **风险等级**：中（认证校验变更需全量回归；存量用户名含下划线/短于 6 位者不受影响——只约束新建/改动）。
- **向后兼容**：是。放宽/收紧仅作用于**新建与改密**；登录仍兼容历史 username/nickname。
