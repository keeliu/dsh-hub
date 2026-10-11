# Tasks: UI 设计体系落地

需求编号沿用 `docs/06-UI优化需求.md`：**C**=色彩与令牌、**U**=用户端、**A**=管理端、**D**=数据展示、**N**=导航骨架。

## 前置条件

- [x] `design.md`（仓库根）—— 视觉取值唯一真相源（由早期「像素实测版设计规范」与「组件/实现版 design.md」两份草稿整合而成）
- [x] `docs/06-UI优化需求.md` —— 需求编号与现状证据
- [x] `docs/05-设计规范.md` —— 已并入仓库根 `design.md`（该文件不再单独存在）
- [x] 本变更 `proposal.md` / `design.md` / `specs/*.md`
- [ ] `route-modularization` 阶段 5（拆 `views/layout.ts`）定稿后，P3 才动页面边界

## 里程碑与审查门

- [x] **M1 规范就位**：`proposal.md` + `design.md` + `specs/money-units.md` + `specs/visual-system.md` + `tasks.md`
- [x] **M2 审查通过**（OpenSpec 第 2 步 Review）：用户确认方向与本次实施范围（M3/P0 先行，视觉改造待后续排期）
- [x] **M3 P0 完成**：金额单位 + 封禁失败 + 未定义样式 + `/payment/return` 全部落地；验证 —— `tsc --noEmit` EXIT=0、m1 24/24、m2 29/29、security 38/38、`migrate-v8-selftest` 19/19、`schema-v8-selftest` 12/12、`format-selftest` 42/42、`page-admin-regression` 14/14、`ui-audit` 阻断级 0（原 6 个未定义变量 / 6 个未定义 class / 2 处游离声明全部归零）
- [ ] **M4 P1 完成**：令牌层 + 骨架 + gateway 换肤
- [ ] **M5 P2 完成**：组件换肤 + 可访问性基线
- [ ] **M6 P3 完成**：页面套用 + 样式拆分 + 去重收口
- [ ] **M7 归档**：specs 合并进 `openspec/specs/`，移入 `archive/`

> **本次实施范围**：M3（阶段 1，P0）—— 只做「数据说错 / 操作说假话 / 样式静默失效」四类**功能性缺陷**，不动视觉。视觉改造（M4–M6）待 M2 审查确认后再排期。

## 阶段 0：静态自查脚本（先建标尺）

- [x] 0.1 新增 `scripts/ui-audit.mjs`，实现 8 类检查：①`tokens.ts` 外的颜色字面量；②未定义 `var(--x)`；③`!important`；④重复选择器；⑤非 `Asia/Shanghai` 的时间格式调用；⑥未转义插值（提示级）；⑦CSS 规则块外的游离声明；⑧引用了但未定义的 class
- [x] 0.2 脚本输出「文件:行 + 规则 + 命中数」，阻断级命中非零退出（⑥ 为提示级不计入失败）
- [x] 0.3 跑 `--baseline` 记录 P0 完成后的基线：总命中 180（①106 / ③17 / ④13 / ⑤8 / ⑥36），**②未定义变量 0、⑦游离声明 0、⑧未定义 class 0**

## 阶段 1：P0 —— 阻断性问题（不等待令牌层）

### 1.1 金额单位（`specs/money-units.md`）

- [x] 1.1.1 新增 `views/format.ts`：`formatMoney(cents)`、`yuanToCents(yuan)`、`centsToYuan(cents)`
- [x] 1.1.2 `yuanToCents` 拒绝 `NaN` / 负数 / 超过 2 位小数 / 空值
- [x] 1.1.3 新增 `scripts/format-selftest.mjs` 断言：`1990→"¥19.90"`、`"19.90"→1990`、`"19.9"→1990`、`"19.999"→拒绝`、`199000→"¥1,990.00"`
- [x] 1.1.4 修正下单金额换算：`api.ts` 的 `total_fee` 改用 `centsToYuan(price)`（换算点原在 `payment.ts`，实现落在 `api.ts`）
- [x] 1.1.5 修正回调金额校验：两侧归一到分再比（替换 `membership.ts` 的 `order.amount.toFixed(2)` 与 `api.ts` 的 `String(order.amount)`）
- [x] 1.1.6 修正 `/api/payment/query/:orderId` 触发回调时传入的金额为「分→元」换算值
- [x] 1.1.7 修正 `membership.ts` 价格兜底返回分（当前为小数元 `19.9`）
- [x] 1.1.8 `views/admin.ts` 订单列表改用 `formatMoney`（修 100 倍放大）
- [x] 1.1.9 `views/user.ts` 支付弹窗金额改用 `formatMoney`
- [x] 1.1.10 统一 `MEMBERSHIP_CONFIG.price` 的单位命名（改 `priceYuan` 或改为分）
- [x] 1.1.11 新增迁移 v8：`orders.amount` / `membership_prices.*` 重建为 `INTEGER` 列亲和性（**不改写存量数值**，单位错误的行由 `getSuspiciousMoneyValues()` 提示）；幂等
- [x] 1.1.12 迁移前用 `VACUUM INTO` 生成 `dshhub.db.bak`；`scripts/migrate-v8-selftest.mjs`（旧库升级）与 `scripts/schema-v8-selftest.mjs`（全新库建齐）双自测覆盖
- [x] 1.1.13 在 `openspec/specs/data-model.md` 补充 `orders` / `membership_prices` 金额单位为「分」

### 1.2 封禁失败被吞

- [x] 1.2.1 `pages.ts` 封禁链路：`disableUser()` 抛错时以失败 flash 响应，不 redirect 成功态
- [x] 1.2.2 同类问题一并排查：`pages.ts` 其余 `try{…}catch(console.error)` 后继续成功分支的写法
- [ ] 1.2.3 手工验证：令 `disableUser` 抛错 → 页面显示红色失败提示

### 1.3 未定义变量 / 类名 / CSS 错位

- [x] 1.3.1 定义或替换 6 个未定义变量：`--gray-600`、`--color-text-tertiary`、`--color-primary`、`--font-size-2xl`（疑为 `--font-size-xxl` 错字）、`--color-error`、及 `views/admin.ts` 侧同名项
- [x] 1.3.2 补齐 `/payment/return` 6 个未定义 class（`.payment-*`）；删除与 `.membership-expires` 的命名冲突
- [x] 1.3.3 定义或替换价格页 6 个未定义 class：`price-row` / `price-field` / `price-label` / `input-group` / `input-prefix` / `input-suffix`
- [x] 1.3.4 修复 CSS 游离声明（`layout.ts` `.dropdown-item-danger` 与 `.dropdown-divider` 闭合后遗留的声明与多余 `}`）
- [x] 1.3.5 修 `6 个未定义变量` 后确认 `ui-audit.mjs` 规则②命中归零（实测 0 处；规则⑧未定义 class 亦为 0）

### 1.4 `/payment/return` 状态矛盾

- [x] 1.4.1 该页按订单真实状态分三态渲染（成功 / 待支付或处理中 / 失败），不再无条件「支付成功 ✓」
- [x] 1.4.2 消除「支付成功」与「未激活」徽章并存的矛盾
- [x] 1.4.3 移除 `views/user.ts` 中已死的 `MEMBERSHIP_PRICES` 常量（全文检索确认无引用；该常量内还是过期价 `¥19.9`/`¥198`）

## 阶段 2：P1 —— 令牌层与基础组件

### 2.1 令牌层

- [x] 2.1.1 新增 `views/styles/tokens.ts`：按 `design.md` §3 落全量 `:root` 令牌（表面/描边/文字/品牌状态/徽章/字体/字号/间距/圆角/阴影/动效/焦点/布局/层级）
- [x] 2.1.2 全部旧变量名以过渡别名形式指向新令牌（`--primary`/`--bg-page`/`--radius-full`/`--font-size-*` 等 27 项），旧页面无需改动即可生效
- [ ] 2.1.3 删除已确认冗余的旧变量（延后到阶段 5 全站替换完成后执行，避免中途出现未定义变量）
- [x] 2.1.4 令牌命名遵循命名空间（`--surface-*`/`--text-*`/`--brand-*`/`--state-*`/`--badge-*`/`--fs-*`/`--space-*`/`--radius-*`/`--shadow-*`/`--dur-*`/`--z-*`/`--layout-*`）

### 2.2 数据类型与格式化

- [x] 2.2.1 `views/format.ts` 补齐 `formatDateTime`（固定 `Asia/Shanghai` + `YYYY-MM-DD HH:mm:ss`）、`formatEmpty`（统一 `—`）、`formatNumber`（千分位）
- [x] 2.2.2 状态/角色/动作/订单状态的中文映射表（单点定义）
- [ ] 2.2.3 替换全站时间渲染（清除不指定时区的 `toLocaleString("zh-CN")`；`ui-audit` 规则⑤当前基线 8 处）
- [ ] 2.2.4 `ui-audit.mjs` 规则⑤基线递减直至归零

### 2.3 基础组件

- [ ] 2.3.1 `views/icons.ts`：扩展为覆盖导航与操作的最小 SVG 图标集，提供 `icon(name, opts)`；替代导航 emoji
- [x] 2.3.2 新增 `views/styles/base.ts`：全局 `:focus-visible` 兜底（此前全仓库无任何焦点样式）、`:focus:not(:focus-visible)` 抑制、`.sr-only`、`.skip-link`、reset 与 `tabular-nums` 工具类
- [ ] 2.3.3 新增 `views/styles/components.ts`：按钮（含四态与 `:focus-visible`）、卡片、指标卡、输入框、徽章、筛选胶囊、分段控件、表格+溢出容器、分页
- [x] 2.3.4 徽章改用 `<bg>/<fg>` 成对令牌（success 4.6:1 / warning 4.9:1 / danger 5.3:1 / info 5.1:1），消除原 2.2:1 与 2.95:1
- [x] 2.3.5 新增 `views/components.ts`：`csrfField`（字段名 `_csrf`）与 `flashHtml` 单点实现；`layout.ts` 再导出 `csrfField` 保持既有导入
- [x] 2.3.6 修正 `layout.ts` 登出表单死字段（`name="csrf" value=""` → `csrfField()` 的 `_csrf`），并给 `/admin`、`/admin/audit` 补传 `csrf`

## 阶段 3：P1 —— 骨架与 gateway 换肤

> 已完成部分（本批）：`--layout-topbar-height` 与 `--layout-sidebar-width` 已在壳层生效——
> `.navbar` 高度、`.admin-layout` 最小高度统一引用同一令牌（原 56px / `calc(100vh - 56px)` 硬编码），
> `.admin-sidebar` 由硬编码 200px 改为 240px 令牌；`.container`/`.workspace-container` 的 `!important` 已清除；
> 8 张表格全部包进 `.table-wrap` 溢出容器并设 `min-width: 640px`（修复窄屏整页横向滚动）。
> 剩余（3.1–3.4、3.5–3.7）为壳结构重建与 gateway 换肤。

- [x] 3.1 新增 `views/nav.ts`：`navItems(role)` 声明表，收敛 `layout()` 中的三元组分支（管理端侧栏项也迁入 `adminNavItems()`）
- [x] 3.2 重建壳结构：`header.navbar` + `nav.navbar-nav` + `main.container#main`，含 `.skip-link` 跳到主要内容
- [x] 3.3 `--layout-topbar-height` 单点定义（`.navbar` / `.admin-layout` / `.workspace-container` 均引用）；`100vh` → `100dvh` 保留回退声明
- [x] 3.4 实现 ≤768px 抽屉导航（`#nav-toggle` + `.navbar-nav.is-open`，带 `aria-expanded`/`aria-controls`；管理端侧栏改横向滚动条，替换原先直接 `display:none`）
- [ ] 3.5 `gateway.ts` 注入样式改为引用同一令牌与 56px 基准（**只替换样式字符串，不整段取一侧**）
- [ ] 3.6 回归：workspace loading 兜底页、实例落地页、`__DSH_BOOT__` 注入不被破坏
- [ ] 3.7 实测从 `/instances` 进入 `/workspace` 导航高度差为 `0px`

## 阶段 4：P2 —— 组件换肤与可访问性

- [ ] 4.1 按令牌替换组件样式，静态卡片去阴影、白底改浅灰底
- [ ] 4.2 弹窗组件：`role="dialog"` + `aria-modal` + `aria-labelledby` + `Esc` 关闭 + 焦点限制
- [ ] 4.3 下拉菜单：`aria-expanded` / `aria-haspopup` / 键盘可达
- [ ] 4.4 危险操作二次确认改用应用内弹窗（替换原生 `confirm()`）
- [ ] 4.5 Toast 替换 `alert()`（管理端插件页四处）
- [ ] 4.6 表单：`invalid` 态 + 错误文案 + 失败保留输入 + 提交 loading/disabled
- [ ] 4.7 表格响应式 + `th scope` + `caption`/`aria-label`
- [ ] 4.8 `prefers-reduced-motion` 支持
- [ ] 4.9 内联 `style` 收敛（当前 88 处）
- [ ] 4.10 `ui-audit.mjs` 规则①③命中归零（含 `.container` 的 `!important` 清除）

## 阶段 5：P3 —— 页面套用、样式拆分与收敛

- [ ] 5.1 抽取 `views/styles/shell.ts`（骨架）
- [ ] 5.2 抽取 `views/styles/overlays.ts`（弹窗/Toast/下拉）
- [ ] 5.3 抽取 `views/styles/charts.ts`（图表/日志查看器/骨架屏）
- [ ] 5.4 抽取 `views/styles/auth.ts`（`AUTH_CSS` 去重）
- [ ] 5.5 新增 `views/styles/index.ts` 汇总导出；`layout.ts` 只 import
- [ ] 5.6 逐页套用新组件（用户端 6 页 + 管理端 8 页 + 认证页 5 个）
- [ ] 5.7 图标系统全量替换导航/操作 emoji
- [ ] 5.8 列表分页（用户/实例/订单/审计）+ 服务端不再静默截断
- [ ] 5.9 枚举中文化（实例状态、角色、审计动作、订单状态）
- [ ] 5.10 修正 `user.ts` 两处未转义插值（`order_no`、`payment_order_id`）
- [ ] 5.11 修正内联事件处理器引号注入（删除确认绕过）
- [ ] 5.12 统一标题层级（用 `.page-title` / `.page-subtitle`）
- [ ] 5.13 403/404 页改用统一骨架
- [ ] 5.14 favicon 与 `theme-color`
- [ ] 5.15 清理死代码：`.auth-container`、`.workspace-container`、重复的 `statusBadge`、重复的 `UserInfo`/`AuditEntry`
- [ ] 5.16 删除过渡别名；`design.md` 同步更新
- [ ] 5.17 确认 `views/*.ts` 每个文件 ≤ 300 行（含与 `route-modularization` 阶段 5 的合并验收）

## 阶段 6：验证与交付

- [ ] 6.1 `cd dsh-hub && npx tsc -p . --noEmit` → 退码 `0`
- [ ] 6.2 `TMPDIR=/data/dsh/home/.m2tmp bash scripts/m1-smoke.sh` → `PASS=24 FAIL=0`
- [ ] 6.3 `TMPDIR=/data/dsh/home/.m2tmp bash scripts/m2-smoke.sh` → `PASS=29 FAIL=0`
- [ ] 6.4 `scripts/security-regression.sh` → 无**新增**失败（已知环境性 `000` 3 项见 design.md §5 注）
- [ ] 6.5 `node scripts/ui-audit.mjs` → 6 类规则全通过
- [ ] 6.6 `node scripts/format-selftest.mjs` → 全通过
- [ ] 6.7 走查：375 / 768 / 1280 / 1440 四档宽度，无横向滚动、导航可用
- [ ] 6.8 走查：键盘 Tab 全流程 + `Esc` 关弹窗 + skip-link 生效
- [ ] 6.9 走查：对比度扫描无 `4.5:1` 以下正文
- [ ] 6.10 更新 `README.md` / `docs/00-进展日志.md` / `CHANGELOG.md`
- [ ] 6.11 提交并推送（deploy key 通路已就绪），提交信息标注是否触碰 `gateway.ts`
- [ ] 6.12 归档变更到 `openspec/changes/archive/`

## 预估工作量

- 阶段 0：0.5 小时
- 阶段 1：4 小时（其中金额单位含迁移与回调校验占 2 小时）
- 阶段 2：5 小时
- 阶段 3：3 小时
- 阶段 4：5 小时
- 阶段 5：8 小时（含 14 个页面套用）
- 阶段 6：2 小时
- **总计：约 27.5 小时**

## 风险与依赖

- **依赖**：`route-modularization` 阶段 5 定稿（P3 复用其页面边界，避免同一批页面搬迁两次）
- **风险**：迁移 v8 改写存量金额 → 必须备份 + 临时库先验
- **风险**：`gateway.ts` 样式改动曾被上游整段覆盖 → 只替换样式字符串并回归落地页
- **风险**：m1/m2 冒烟在本机受 `/tmp` tmpfs 限制 → 验证命令固定带 `TMPDIR`
