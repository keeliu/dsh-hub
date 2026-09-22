# 实施清单：登录/认证与 Workspace 体验修复

> 三个工作流相互独立，可分别实施/验收。实现须通过 `npx tsc -p . --noEmit` 并回归冒烟测试。
> 已确认：会话时效**不调整**；密码最短长度 **≥8**。

## 工作流 1：Workspace 启动超时兜底

- [ ] 1.1 `gateway.ts` 新增常量 `WORKSPACE_START_TIMEOUT_MS = 60_000`、`WORKSPACE_POLL_INTERVAL_MS = 2_000`
- [ ] 1.2 抽出可复用导航注入片段（供 loading/超时页复用 hub 顶部栏）
- [ ] 1.3 重写 loading 页 JS：
  - `POST /api/instances/:id/start` 只发一次（`hasTriedStart` 去抖）
  - 轮询 `GET /api/instances`；超过 60s → 停止轮询，切到"启动超时"态
  - 超时态展示 hub 顶部栏 + 按钮：重试(`/workspace`)、实例管理(`/instances`)、返回首页
  - 可选：实例 `failed` 时直接进入失败态并给日志入口
- [ ] 1.4 验证：模拟实例起不来，60s 后不再转圈、顶部栏可见、按钮可用

## 工作流 2：统一用户名/密码规则与提示

- [ ] 2.1 `users.ts`（或新增 `validation.ts`）新增常量与函数
  - `USERNAME_MIN_LEN=6 / USERNAME_MAX_LEN=32 / PASSWORD_MIN_LEN=8`
  - `isValidUsername` 改为 `^[a-zA-Z0-9]{6,32}$`
  - `validatePassword(pw): string | null`（长度 + 字母数字）
- [ ] 2.2 后端改造：`api.ts`(setup/register/reset/admin-create/admin-patch)、`pages.ts`(setup/register/reset) 的密码校验改 `validatePassword`；用户名统一 `isValidUsername`；错误文案统一
- [ ] 2.3 前端改造：`views/auth.ts`(setup/register/reset) 与 `views/admin.ts`(建用户)
  - 用户名 `placeholder/pattern/title/autocomplete`
  - 密码 `placeholder/minlength/pattern/title/autocomplete=new-password`
- [ ] 2.4 登录页 `account` 补 `autocomplete="username"`
- [x] 2.5 已确认：`PASSWORD_MIN_LEN = 8`（≥8，且须同时含字母+数字）
- [ ] 2.6 验证：非法用户名/弱密码被前后端一致拒绝；提示文案一致；合法可注册

## 工作流 3：认证页移动端兼容

- [ ] 3.1 `views/layout.ts` 的 `AUTH_CSS`：`100vh`→追加 `100dvh`；`align-items:flex-start` + `margin:auto 0` + `overflow-y:auto`
- [ ] 3.2 移除未定义 `--radius-pill`，输入框改标准圆角
- [ ] 3.3 输入框统一原生属性（`autocomplete`/`inputmode`/`pattern`/`minlength`/`font-size:16px`）
- [ ] 3.4 覆盖 登录/注册/setup/忘记密码/重置密码；后台建用户表单同源样式一并检查
- [ ] 3.5 验证：鸿蒙/微信/百度APP 等机型可正常调起输入法、键盘不遮挡输入框

## 验证与归档

- [ ] 4.1 `npx tsc -p . --noEmit` 通过
- [ ] 4.2 冒烟：`bash dsh-hub/scripts/m1-smoke.sh`、`m2-smoke.sh`、`security-regression.sh`
- [ ] 4.3 手动：登录/注册/重置/建用户全流程；Workspace 超时兜底；移动端输入法
- [ ] 4.4 更新 `AGENTS.md`「当前进度」
- [ ] 4.5 提交 + 归档到 `openspec/changes/archive/`，规范合并 `openspec/specs/`
