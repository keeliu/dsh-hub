# 实施清单：登录/认证与 Workspace 体验修复

> 三个工作流相互独立，可分别实施/验收。实现须通过 `npx tsc -p . --noEmit` 并回归冒烟测试。
> 已确认：会话时效**不调整**；密码最短长度 **≥8**。

## 工作流 1：Workspace 启动超时兜底

- [x] 1.1 `gateway.ts` 新增常量 `WORKSPACE_START_TIMEOUT_MS = 60_000`、`WORKSPACE_POLL_INTERVAL_MS = 2_000`
- [x] 1.2 抽出可复用导航注入片段（供 loading/超时页复用 hub 顶部栏）
  - `renderHubNavStyle()` / `renderHubNavBar(user, brandHref)`；`injectDeploymentConfig` 改为调用两者（输出与原实现一致）
  - `brandHref` 默认 `/`；loading/超时页传 `/instances`（见 1.4 落点说明）
- [x] 1.3 重写 loading 页 JS：
  - `POST /api/instances/:id/start` 只发一次（`hasTriedStart` 去抖）
  - 轮询 `GET /api/instances`；超过 60s → 停止轮询（`settled` 置位），切到"启动超时"态
  - 超时态展示 hub 顶部栏 + 按钮：重试(`/workspace`)、实例管理(`/instances`)
  - `status === 'failed'` 时**不等满 60s**直接进入失败态，日志入口 `/instances/<id>`
- [x] 1.4 验证：模拟实例起不来，60s 后不再转圈、顶部栏可见、按钮可用
  - 验证方式：`/workspace` 实际渲染 + Node 虚拟时钟/DOM 仿真（14 项全过）
  - **落点说明（决策 A1 落实）**：`GET /` 对会员实测 302 → `/workspace`（回环），
    故"返回首页"语义由**顶部栏品牌链接**（→ `/instances`）承担，动作按钮为「重试」+「实例管理」两个，
    未再放第三个指向同一地址的按钮（避免冗余/误导）。验收场景 1.4「返回入口落在带导航的 `/instances` 且不回环」已满足。

## 工作流 2：统一用户名/密码规则与提示

- [x] 2.1 `users.ts` 新增常量与函数
  - `USERNAME_MIN_LEN=6 / USERNAME_MAX_LEN=32 / PASSWORD_MIN_LEN=8`
  - `USERNAME_RULE_MESSAGE`（`用户名需为 6-32 位英文字母或数字`）、`PASSWORD_RULE_HINT`（`至少 8 位，且同时包含字母和数字`）
  - `isValidUsername` 改为 `^[a-zA-Z0-9]{6,32}$`（按常量拼装）
  - 新增 `validateUsername(u): string | null`、`validatePassword(pw): string | null`（长度 + 字母数字）
- [x] 2.2 后端改造：`api.ts`(setup/register/reset/admin-create/admin-patch)、`pages.ts`(setup/register/reset) 的密码校验改 `validatePassword`；用户名统一 `validateUsername`；错误文案统一
  - 额外收紧（原实现无校验，属同一规则范围）：`pages.ts` 的 `POST /admin/users` 页面表单
    （后台建用户表单实际提交到该路由，此前用户名/密码**完全无服务端校验**）已补 `validateUsername` + `validatePassword`
  - `pages.ts` setup 仅在填写了 username 时校验（留空时回退 nickname，保持首启向导兼容）
- [x] 2.3 前端改造：`views/auth.ts`(setup/register/reset) 与 `views/admin.ts`(建用户)
  - 用户名 `placeholder/pattern/title/autocomplete/inputmode/minlength/maxlength`
  - 密码 `placeholder/minlength/pattern/title/autocomplete=new-password`
  - 前端 `pattern`/`title`/`placeholder` 由 `users.ts` 常量插值生成，避免与后端文案漂移
- [x] 2.4 登录页 `account` 补 `autocomplete="username"`（密码补 `current-password`）
- [x] 2.5 已确认：`PASSWORD_MIN_LEN = 8`（≥8，且须同时含字母+数字）
- [x] 2.6 验证：非法用户名/弱密码被前后端一致拒绝；提示文案一致；合法可注册
  - 实测：用户名 2 位/含下划线/33 位 → 400 且文案 `用户名需为 6-32 位英文字母或数字`；
    密码 7 位 → `密码至少 8 位，且同时包含字母和数字`；纯字母/纯数字 → `密码需同时包含字母和数字`；
    合法注册 + 登录均 200；后台建用户同规则（302 重定向成功）

## 工作流 3：认证页移动端兼容

- [x] 3.1 `views/layout.ts` 的 `AUTH_CSS`：`100vh`→追加 `100dvh`；`align-items:flex-start` + `margin:auto 0` + `overflow-y:auto`
  - 说明：`margin: auto 0` 落在真正的 flex 子项 `.auth-page` 上（`.auth-card` 是 `.auth-page` 内的块级子元素，
    加在它上面不产生居中效果）；`-webkit-overflow-scrolling: touch` 一并补上
- [x] 3.2 移除未定义 `--radius-pill`，输入框改标准圆角（`var(--radius-md)` = 8px）
- [x] 3.3 输入框统一原生属性（`autocomplete`/`inputmode`/`pattern`/`minlength`/`font-size:16px`）
  - 另补：`-webkit-user-select:text`（部分内核默认禁止输入框选中文本）、按钮 `min-height:44px`（触摸目标）
- [x] 3.4 覆盖 登录/注册/setup/忘记密码/重置密码；后台建用户表单同源样式一并检查
  - 后台建用户表单复用全局 `.form-control`（无 `--radius-pill` 引用），仅规则属性对齐
- [x] 3.5 验证：鸿蒙/微信/百度APP 等机型可正常调起输入法、键盘不遮挡输入框
  - **仅完成静态与结构层验证**（`100dvh`/`flex-start`/可滚动/16px/原生属性均在渲染产物中确认）；
    **真机验证待用户在鸿蒙/微信/百度 APP 上实测**（本环境无浏览器/真机）

## 验证与归档

- [x] 4.1 `npx tsc -p . --noEmit` 通过
- [x] 4.2 冒烟：`bash dsh-hub/scripts/m1-smoke.sh`、`m2-smoke.sh`、`security-regression.sh`
  - `m1-smoke.sh`：**PASS=24 FAIL=0**
  - `m2-smoke.sh`：PASS=16 FAIL=13 —— 与**改动前基线完全一致**（13 项均为本沙箱 `dsh web` 实例起不来的环境问题，非本次改动引入）
  - `security-regression.sh`：在改动前的 `HEAD` worktree 上对照运行，**无「基线通过、改动后失败」的用例**（该套件在本环境波动大，实例类用例随机失败）
- [x] 4.3 手动：登录/注册/重置/建用户全流程；Workspace 超时兜底；移动端输入法
  - 已用真实 HTTP 调用覆盖：登录 / 注册（含全部拒绝分支）/ 重置页渲染 / 后台建用户 / Workspace loading 超时兜底（虚拟时钟仿真 14 项）
  - **移动端输入法一项无法在本环境验证，待真机确认**
- [x] 4.4 更新 `AGENTS.md`「当前进度」
- [ ] 4.5 提交 + 归档到 `openspec/changes/archive/`，规范合并 `openspec/specs/`
  - 代码已提交；**归档待真机验收（3.5）与生产验证后再执行**，避免过早归档掩盖未完成的真机项

## 完成说明（2026-09-22）

- 三个工作流代码全部落地，`tsc` 零错误。
- 与提案的**唯一偏差**：工作流 1 的"返回首页"未做成第三个按钮，改由顶部栏品牌链接承担（理由见 1.4）。
- 额外收紧一处提案未列出的校验盲区：`POST /admin/users`（后台建用户页面表单）此前对用户名/密码无任何服务端校验。
