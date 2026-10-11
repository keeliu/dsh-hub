# Proposal: UI 设计体系落地（design tokens + 视觉重构）

## Why

控制面（用户端 + 管理端，共 21 个页面）的样式由 `views/layout.ts` 里 898 行 CSS 字面量驱动，已经积累出四类**会让用户或管理员做错决定**的问题，而不是单纯的「不好看」：

1. **数据说错 —— 金额单位在三层各说各话。** 详见「现状核实」A-01，后果是管理员按 100 倍金额对账、且**线上支付回调必然失败**（第 3 层）。
2. **操作说假话 —— 封禁失败被吞掉后返回成功。** `views/admin.ts`/`pages.ts` 的封禁路径 catch 内只 `console.error`，随后无条件 redirect（`pages.ts:646-649`）。
3. **界面说没有 —— 14 个 class + 6 个 CSS 变量被引用但从未定义**，其中 `/admin/prices`（价格管理）整页无样式、`/payment/return`（支付回跳）整页无样式。因为 `var()` 无 fallback 时静默失效，**改样式不生效也不报错**。
4. **改不动 —— CSS 有游离声明导致后续解析错位**（`views/layout.ts:197-198`、`:209-211`），任何依赖「后者覆盖前者」的改动都可能静默失败。

在此之上才是视觉落差：卡片白底+阴影、输入框 24px 胶囊、主按钮蓝底，与目标视觉语言相反。

**目标**：把 `design.md`（仓库根，v2）从「一份描述」变成「一套唯一真相源 + 可验证的落地」，并使上述 4 类问题在收口时**由静态自查与回归脚本拦截**，而非靠人工记忆。

## 现状核实（提案级事实，均已对本机 HEAD 逐行复算）

> 复核方法：`git log`/`grep -c`/`sed -n` 直读源码 + 定义-引用集合差集运算。**以下几处与既有需求文档 `docs/06-UI优化需求.md` 的表述不同，以本节为准。**

### A-01 金额单位（比原描述严重，且原描述的修法会改错）

权威定义应为：**`orders.amount` 与 `membership_prices.price` / `original_price` 的单位是「分」**（`db.ts:282-284` 播种 990/2990/1990/19900/29900，`db.ts:276` 注释「单位：分」）。

原文档称「管理端未除 100、用户端除了 100」，据此修法是把管理端补上 `/100`。**这是错的**，因为三层里有两层是「不该除」的：

| 层 | 位置 | 现写法 | 实际语义 | 判定 |
|---|---|---|---|---|
| 下单对外金额 | `api.ts:710` `total_fee: (price / 100).toFixed(2)` | 除 100 | 虎皮椒 `total_fee` 单位是**元** | ✅ 正确 |
| 下单返回金额 | `api.ts:730` `amount: price / 100` | 除 100 | 返回给前端弹窗，弹窗按元显示（`user.ts:409`） | ✅ 内部自洽 |
| 支付回调金额比对 | `membership.ts:279` `order.amount.toFixed(2)` | **不除** | 虎皮椒回调 `total_fee` 是**元**字符串 | ❌ **1990 → `"1990.00"` ≠ `"19.90"` → 每笔支付都判 `fee mismatch`** |
| 主动查单触发回调 | `api.ts:812` `String(order.amount)` | **不除** | 同上 | ❌ 同上 |
| 管理端订单表 | `admin.ts:456` `¥${order.amount.toFixed(2)}` | 不除 | 应显示元 | ❌ 显示 `¥1990.00` |
| 用户端个人中心 | `user.ts:594` `¥${(order.amount/100).toFixed(2)}` | 除 100 | 应显示元 | ✅ 正确 |
| 下单兜底价（DB 无行时） | `membership.ts:51-56` `return MEMBERSHIP_CONFIG[type].price` = **19.9（元）** | 被 `api.ts:710` 当分再除 100 | 应返回分 | ❌ **兜底价被当成分 → 实收 0.199 元** |
| 原价兜底（DB 无行时） | `membership.ts:62-63` `{trial:990, monthly:2990, yearly:29900}` | 分 | — | ✅ 与 DB 一致 |

**结论：真正需要改的是 `membership.ts` 的两处回调比对（第 3、4 行）与 `membership.ts:51-56` 的兜底单位**，`admin.ts:456` 只是显示层症状。原文档把 `admin.ts:456` 定为「不改 100 倍」的根因，会把回调修正漏掉 —— 即修完显示、**支付仍然无法完成**。

另有一处独立缺陷：`membership_prices.price` 声明为 `REAL`（`db.ts:265`），而 `MEMBERSHIP_CONFIG` 是小数元（`19.9`）。SQLite 的 REAL 亲和性在存入整数值时会**就地转成 INTEGER**，因此同一列可能同时存在 `1990`（INTEGER）与 `19.9`（REAL）两种存储类 —— 这是「同一字段两种单位」能同时存活的数据层原因。金额必须改为 INTEGER（分）。

### A-02 封禁失败被吞（原描述准确）

`pages.ts:646-649`：`try { await disableUser(...); audit(...) } catch (e) { console.error('disableUser failed:', e); }` 后**无条件** `redirect(res, '/admin/users')`。`disableUser` 会停止该用户全部实例并吊销会话/令牌，失败时管理员看到的是正常返回。

### C-01 / C-02 未定义引用与 CSS 错位（原描述准确，类数比原描述多 2 个）

定义-引用差集（`grep -oE '--[a-z0-9-]+:'` vs `var(--…`）→ 34 个被引用、28 个有定义，**6 个未定义**：`--text-muted`（`admin.ts:154`）、`--color-text-tertiary`（`layout.ts:591`）、`--color-primary`（`:598`）、`--font-size-2xl`（`:596`）、`--color-error`（`:868`）、`--gray-600`（`layout.ts:1052`/`:1099`、`user.ts:64/65/130/150`）。

类需要按「定义 0 次 / 使用 ≥1 次」判定，实测 **14 个**（原文档只列了价格页 6 个）：

| class | 使用处 | 影响 |
|---|---|---|
| `price-row` / `price-field` / `price-label` / `input-group` / `input-prefix` / `input-suffix` | `admin.ts:495-557` | `/admin/prices` 无栅格、「¥」前缀不显示 |
| `payment-return` / `payment-return-icon` / `payment-return-desc` / `payment-return-actions` | `user.ts:658-675` | `/payment/return` 整页无样式 |
| `membership-badge` | `user.ts:666` | 会员徽章无样式 |
| `membership-expire` | `user.ts:669` | **注意：CSS 里定义的是复数 `.membership-expires`（`layout.ts:721`），单复数不匹配** |
| `payment-qrcode` | `user.ts:335` | 二维码容器无样式 |

另：`table-wrap` 定义 0 次、使用 0 次 —— 全站**没有任何表格有溢出容器**。

CSS 游离声明（`layout.ts:197-198`、`:209-211`）的**实际解析后果**（比「错位」更具体，修的时候要按这个判断）：`.dropdown-item-danger` 规则在 `:196` 已闭合，`:197` 的独立 `cursor: pointer;` 会被 CSS 错误恢复规则**并入该规则**（无害，因为块内已有同名声明）；而 `.dropdown-divider` 在 `:208` 闭合后，`:209-211` 的 `font-weight: 600` + `font-size: var(--font-size-base)` + `}` 会被并入 `:209` 之后的**下一条规则**（即 `.container`），使其被注入两个意料之外的字号/字重声明。修法：删除或写回对应规则块。

### 其他与 `design.md` 一致的关键事实

- `layout.ts` 现 **1117 行**（`CSS` = `:11-908`、`AUTH_CSS` = `:1017-1117`），违反 `openspec/specs/standards.md` §2「视图 ≤300 行」。
- `views/` 下 `aria-*` / `role=` / `tabindex` 命中数 **0**；全站 `focus-visible` 0 处。
- 卡片为白底 + `--shadow-card: 0 2px 8px`（`layout.ts:40`），与目标「`#f5f6f7` 填充、无阴影」相反。
- 输入框 `--radius-full: 24px`（`layout.ts:51`）当作胶囊用，实际不是真胶囊。
- 全站仅 2 个 `@media`，均在 `layout.ts`（`:900-907`、`:1109-1116`），且 `:906` 用 `display:none` 隐藏 `.admin-sidebar` 而不提供替代导航。

## What Changes

### 规格层

1. **新增 `openspec/specs/visual-system.md`** —— 把 `design.md` 的视觉规范转成**可判定的 Requirement/Scenario**（令牌唯一真相源、组件契约、数据展示、响应式、a11y、静态自查），作为长期规范而非一次性变更说明。
2. **修改 `openspec/specs/data-model.md`** —— 显式声明 `orders.amount`、`membership_prices.price`、`membership_prices.original_price` 单位为**分**（INTEGER），并规定「对外支付网关金额才换算成元」。
3. **`design.md` 保留在仓库根**作为设计真相源；`docs/06-UI优化需求.md` 保留为需求清单，但**其 A-01 段落的结论以本提案「现状核实」为准**（不改文档，靠本提案与规格约束实现）。

### 实现层（分 5 批，每批独立可验证）

| 批次 | 内容 | 是否破坏性 |
|---|---|---|
| **P0** | 金额单位统一（含支付回调）· 封禁失败可见 · 6 变量 + 14 class 补齐 · CSS 游离声明 · `/payment/return` 三态与逻辑矛盾 | 否，纯缺陷修复 |
| **P1a** | `views/format.ts` + `views/components.ts`（`formatMoney`/`formatDateTime`/`statusBadge` 等纯函数，含单元测试脚本） | 否，新增文件 |
| **P1b** | 令牌层：`views/styles/tokens.ts` 落地 + 过渡别名，`layout.ts` 的 `:root` 改为 import | 否，视觉等价迁移 |
| **P1c** | 骨架重构：`.app`/`.sidebar`/`.topbar`/`.app-content`/`<main>`/`.skip-link`，两端共用；gateway 注入导航同批换肤（`renderHubNavStyle`/`renderHubNavBar`/`LANDING_PAGE_HTML`/workspace loading） | 是，全站视觉切换 |
| **P2** | 组件层换肤（按钮/卡片/指标卡/表格/表单/徽章/筛选器）+ 焦点环 + 对比度 + 触控目标 + 移动端导航抽屉 | 是 |
| **P3** | 页面层逐页套用、a11y 全量、图标系统、内联样式收敛、样式模块拆分（并入 `route-modularization`）、死代码清理 | 是 |

**P0 先行的理由**：P0 的 4 类问题里，金额与封禁是**逻辑错误**（与样式无关，可在令牌迁移前独立验证）；未定义 class/变量与 CSS 错位是**前置障碍** —— 不修，P1b 之后所有样式改动都可能静默失效。因此 P0 不与令牌迁移耦合。

**与 `route-modularization` 的关系**：P1b/P1c 只碰 `views/styles/*` 与新骨架，不动路由文件；P3 的「样式模块拆分」必须复用 `route-modularization` 已定的页面边界，避免二次搬迁。两变更可并行，**P3 需等 `route-modularization` 的页面边界定稿**。

## Impact

- **受影响代码**：`dsh-hub/src/views/layout.ts`（重大）、`views/admin.ts`、`views/user.ts`、`views/auth.ts`、`src/gateway.ts`、`src/membership.ts`、`src/pages.ts`、`src/db.ts`（新增迁移 v8）。
- **受影响规格**：`data-model.md`（金额单位）、新增 `visual-system.md`；`standards.md` §2/§3.2/§8 被引用但不改。
- **数据库**：新增迁移 **v8** —— 把 `membership_prices.price`/`original_price` 规范为 INTEGER 语义，并**纠正已被错误写入的 orders.amount**（现存小数元行需归一化）。属**需备份**的变更。
- **运行时约束**：不引入任何依赖、Web 字体、图标库、CDN、构建步骤（`design.md` 硬约束）。
- **验证手段**：`npx tsc -p . --noEmit` + `design.md` §10.5 的 5 条静态自查 + `scripts/m1-smoke.sh`（24 项）+ `scripts/m2-smoke.sh`（29 项，需 `TMPDIR=/data/dsh/home/.m2tmp`，否则 `/tmp` tmpfs 256M 会 ENOSPC）。

## Out of Scope（本次不做，登记备查）

1. **`route-modularization` 的路由拆分**（`api.ts` 1085 行 / `pages.ts` 918 行）—— 独立变更，本提案只复用其页面边界。
2. **`/api/auth/logout` 的 CSRF 校验缺口**（`api.ts:313` 的 `{csrf:true, auth:false}` 组合因 `let viaSession` 只在 `matched.auth` 分支赋值而永不校验）—— 真实安全缺陷，建议按 `standards.md` §3.2 单独立项。
3. **插件安装阻塞 start 请求**（`startInstance` 在请求路径内同步装 5 个插件，首次可达数分钟，表现为「点启动没反应」）—— 后端项，建议与 U-05 一起排期。
4. **`/api` 与 `/workspace` 代理不查会员**（`gateway.ts:263`/`:297`）—— 安全项，独立立项。
5. **`assets/` 目录内 curl 命令文本含生产 `dshhub_sid`/`dshhub_csrf` 凭据**（public 仓库）—— 凭据轮换与清理属运维动作，需单独处置。
