# 技术方案：登录/认证与 Workspace 体验修复

## 背景：当前认证/路由机制（as-is）

- **会话**（`sessions.ts`）：`dshhub_sid` cookie（HttpOnly+SameSite=Lax）。滑动 TTL `SESSION_TTL_MS = 7d`，绝对上限 `SESSION_ABSOLUTE_TTL_MS = 30d`，每用户最多 `MAX_SESSIONS_PER_USER = 20`。DB 只存 `sha256(token)`。**（已确认维持，不调整）**
- **Bearer API token**：`dsh_` 前缀，DB 存哈希，**无过期**，仅可吊销。
- **登录后落点**（`pages.ts`）：`POST /login` → 管理员 `/admin`；普通会员 `/workspace`。
- **首页**：`GET /` → 会员**重定向 `/workspace`**（不是实例列表）；`GET /instances` 才是实例管理页（带 hub 导航）。
- **Workspace 路由**（`gateway.ts`）：`/workspace` → `handleWorkspaceEntry`；`/workspace/*` → `handleWorkspaceProxy`。
- **无 running 实例时**：`handleWorkspaceEntry` 返回一段**独立 HTML loading 页**（深色、无 hub 导航），JS 每 2s `fetch('/api/instances')`，未 running 就尝试 `POST /api/instances/:id/start`，**无超时**。

---

## 工作流 1：Workspace 启动超时兜底

### 问题定位
`gateway.ts:578-637`：无 `running` 实例 → 返回 loading 页；`pollStatus()` 递归 `setTimeout(2000)`，**没有终止条件**。实例反复启动失败时永远转圈；且该页无 hub 顶部栏，用户无法导航。

### 方案
1. **加超时常量**：`WORKSPACE_START_TIMEOUT_MS = 60_000`（`gateway.ts` 顶部）。
2. **loading 页 JS 增加计时**：记录 `startedAt`；每次轮询检查 `Date.now() - startedAt > 60_000` → 进入"超时"分支：
   - 停止轮询；
   - 切换到超时 UI（保留在 workspace 页面内），**注入 hub 顶部栏**（复用 `injectDeploymentConfig` 的导航 HTML 片段，或直接整页渲染成 hub 导航样式）；
   - 提供按钮：**重新加载/重试**（`location.href='/workspace'`）、**实例管理**（`/instances`）、**返回首页**。
3. **落点修正**：`/` 会重定向回 `/workspace`（回环），因此"返回首页"实际指向 **`/instances`**（带导航、可管理实例）。若产品坚持"回首页"，另需把 `GET /` 改为渲染实例页（本提案默认不动 `/` 的重定向）。
4. **启动去抖**：`POST .../start` 只发一次（用一个 `hasTriedStart` 标志），之后仅轮询 `GET /api/instances`，避免每 2s 重复启动请求。
5. **可选**：若实例 `status === 'failed'`，可直接进入"启动失败"状态并提示查看日志（`/api/instances/:id/logs`），无需等满 60s。

### 关键点
- 导航注入片段应抽成可复用函数（现 `injectDeploymentConfig` 内联），供 loading/超时页复用，避免重复。
- 超时阈值用常量（standards §8.3）。

---

## 工作流 2：统一用户名/密码规则与提示

### 现状不一致
| 项 | 后端 | 前端提示 |
|---|---|---|
| 用户名 | `^[a-zA-Z0-9_]{3,32}$`（`users.ts:112`） | 注册页"3-32位字母数字下划线"；错误文案同 |
| 密码 | 仅 `password.length < 8`（`api.ts` 217/251/355/411/495、`pages.ts` 143/255/385） | 仅 `minlength="8"`；无字母+数字提示 |

### 目标规则（业务口径，已确认）
- **用户名**：仅 `[a-zA-Z0-9]`，长度 **> 5**（取 `≥6`）、`≤32`。
- **密码**：长度 **≥8**（已确认），且**同时包含字母和数字**。

### 方案
1. **单一真相源**（`users.ts` 或新增 `validation.ts`）：
   ```ts
   export const USERNAME_MIN_LEN = 6, USERNAME_MAX_LEN = 32;
   export const PASSWORD_MIN_LEN = 8;
   export function isValidUsername(u: string): boolean { return /^[a-zA-Z0-9]{6,32}$/.test(u); }
   /** 返回错误文案或 null */
   export function validatePassword(pw: string): string | null {
     if (pw.length < PASSWORD_MIN_LEN) return `密码至少 ${PASSWORD_MIN_LEN} 位`;
     if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return '密码需同时包含字母和数字';
     return null;
   }
   ```
2. **后端改造**：所有 `password.length < 8` 与 `isValidUsername` 调用点改用统一函数；`HttpError(400,'weak_password', validatePassword(...))`。
3. **前端改造**：`views/auth.ts`（setup/register/reset）、`views/admin.ts`（建用户）：
   - 用户名：`placeholder="6-32 位英文字母或数字"`、`pattern="[A-Za-z0-9]{6,32}"`、`title` 同文案、`autocomplete="username"`。
   - 密码：`placeholder="至少 8 位，含字母和数字"`、`minlength="8"`、`pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,}"`、`title`、`autocomplete="new-password"`。
   - 错误文案与后端一致（`用户名需为 6-32 位英文字母或数字` / `密码至少 8 位且同时包含字母和数字`）。
4. **登录页**：`account` 输入 `autocomplete="username"`；错误提示保持"用户名/邮箱或密码错误"。

> 兼容性：历史用户名含下划线/短于 6 位者不受影响；新规则只约束**新建用户**与**改密码**。登录查询仍兼容 username/email/nickname。

---

## 工作流 3：认证页移动端兼容（通用组件）

### 问题定位（`views/layout.ts` 的 `AUTH_CSS`）
```css
.auth-body { min-height: 100vh; display:flex; align-items:center; justify-content:center; padding:2rem 1rem; }
.auth-card .form-control { border-radius: var(--radius-pill); }   /* ← 变量未定义 */
```
- 移动端键盘弹起时 `100vh` 不收缩 + 垂直居中 → 聚焦输入框被顶出可视区，鸿蒙等机型表现为"调不起输入法"。
- `--radius-pill` 在 `:root` 未定义（只有 `--radius-full` 等），`border-radius` 失效。

### 方案（改用通用/原生组件）
1. **布局**：
   ```css
   .auth-body { min-height: 100vh; min-height: 100dvh; display:flex;
                align-items:flex-start; justify-content:center;
                padding: 3rem 1rem; overflow-y:auto; }
   .auth-card { margin: auto 0; }   /* 空间足够时视觉居中，键盘弹出时可滚动 */
   ```
   并加 `@media (max-width: 480px)` 微调内边距。
2. **输入组件**：统一原生 `<input>`，补齐 `type/name/autocomplete/inputmode/pattern/minlength/required`；不使用自定义控件。移除 `--radius-pill`，输入框改标准圆角（`8px`）。
3. **表单属性**：`<form>` 加 `novalidate`？——否，**保留浏览器原生校验**（`required`/`pattern`/`minlength`）以协助移动端体验；服务端仍兜底。
4. **可选增强**：给输入框 `font-size:16px`（iOS 聚焦不放大）；`input[type=password], input[type=text] { -webkit-user-select:text; }`。

> 说明：本工作流只处理**认证页**（登录/注册/setup/忘记/重置）。Workspace 页内 DSH 客户端的 `AbortSignal.timeout is not a function` 属**相邻但独立**问题（旧内核缺该 API），建议单列或在网关注入 polyfill（见"相邻问题"）。

---

## 决策记录

| 编号 | 决策 | 结论 | 理由 |
|---|---|---|---|
| A1 | Workspace 超时落点 | 超时进入"启动超时"态并指向 `/instances`（带 hub 导航） | `GET /` 会回环回 `/workspace`，不能作兜底落点 |
| A2 | 超时阈值 | 60s（常量） | 用户要求"超过 1 分钟" |
| A3 | 启动去抖 | `POST start` 只发一次 | 避免每 2s 重复启动请求 |
| B1 | 用户名规则 | `^[a-zA-Z0-9]{6,32}$`（去下划线、≥6） | 用户口径 |
| B2 | 密码规则 | **≥8** 且同时含字母+数字（已确认） | 用户口径；用常量便于调整 |
| B3 | 校验归属 | `users.ts`（或 `validation.ts`）单一真相源，前后端一致 | standards §4.1 单一真相源 |
| C1 | 布局 | `100dvh` + `flex-start` + 可滚动 | 修复键盘遮挡/输入法问题 |
| C2 | 组件 | 原生 `<input>` + 标准属性 | 通用兼容，替代自造样式 |
| C3 | 变量 | 移除未定义 `--radius-pill` | 现样式静默失效 |
| T1 | 会话时效 | **维持现状（不调整）**：滑动 7d / 绝对 30d | 用户确认 |

## 相邻问题（不在本变更范围，建议后续单独处理）
- Workspace 内 DSH 客户端的 `AbortSignal.timeout is not a function`：旧内核缺该 API。可在 `gateway.ts::injectDeploymentConfig` 注入 polyfill 解决，建议另立变更或并入工作流 1 一起做。

## 回滚方案
- 各工作流相互独立：工作流 1 仅改 loading 页 JS/落点；工作流 2 仅改校验函数与文案；工作流 3 仅改 CSS/属性。可分别回退，无数据迁移。
