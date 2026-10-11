# Design: UI 设计体系落地

## 1. 决策总览

| # | 决策 | 备选 | 选择理由 |
|---|---|---|---|
| D1 | 令牌**改名 + 过渡别名**，分 3 批删除别名 | ①就地改值保留旧名 ②一步到位全量替换 | ①会让「旧名新义」在评审 diff 里不可见；②一次改 1000+ 行 CSS 无法分段验证。改名后**新旧名并存**，`greps` 可精确统计迁移进度 |
| D2 | 金额**以「分」为唯一存储单位**，仅在调用支付网关时换算成元 | 以元存储（REAL） | 分是整数，无浮点误差；虎皮椒 `total_fee` 要元字符串，转换点收敛到 1 处 |
| D3 | 令牌落在 `views/styles/tokens.ts`，用 `String.raw` 模板串导出 | 独立 `.css` 文件 + 构建步骤 | 硬约束「无构建步骤、无 CSS 文件」（`design.md` §10.1） |
| D4 | 骨架重构**两端共用同一 `layout()`** | 用户端/管理端各一套 | 现状已是共用（`layout.ts:919-928` 靠三元组区分导航），第二套会重复分叉 |
| D5 | 样式拆分**并入** `route-modularization` 的页面边界 | 自己另定一套 | 避免同一批页面被搬迁两次 |
| D6 | P0 四条**不等待**令牌层，独立先行 | 全等 P1b 后一起做 | 金额/封禁是逻辑错误，未定义 class 与 CSS 错位是「改样式会静默失效」的前置障碍 |
| D7 | 金额单位写进 `data-model.md` + 新增迁移 **v8** 归一化存量数据 | 只改代码约定 | 存量库可能已混入小数元行（见 §2.3），只改代码会让老数据继续错 |

---

## 2. 金额单位（P0 的核心，最易出错）

### 2.1 唯一真相源

```
存储层（SQLite）          分（INTEGER）
  orders.amount
  membership_prices.price / original_price

展示层（SSR / JSON）      分 → formatMoney(cents) 输出 "¥19.90"
  api.ts 返回给前端的 amount 字段仍为分（前端统一走 formatMoney）

对外网关（虎皮椒）        元字符串（保留 2 位小数）
  仅 api.ts 构造 total_fee 时转换
```

**契约**：`formatMoney(cents: number): string` 是唯一渲染入口；**禁止**任何视图出现裸 `.toFixed(2)`。支付网关出入参的换算**只允许出现在 `src/payment.ts` 与 `api.ts` 的下单/回调两处**，且必须带注释标明单位。

### 2.2 单位流向图（本提案要达成的形态）

```
membership_prices.price (分)
        │  getMembershipPrice() → 分
        ▼
   createOrder() ── orders.amount (分)
        │
        ├─→ 下单请求 → payment.ts: centsToYuan(fen) → 虎皮椒 total_fee "19.90"
        ├─→ 下单响应 → { amount: fen } → 前端 formatMoney() → "¥19.90"
        ├─→ 回调校验 → yuanToCents(total_fee) 后与 orders.amount 比较   ← 关键修正点
        └─→ 管理端/用户端列表 → formatMoney(orders.amount) → "¥19.90"
```

回调校验的正确形态（替换 `membership.ts:279` 的 `order.amount.toFixed(2)` 与 `api.ts:812` 的 `String(order.amount)`）：

```ts
// 两侧都先归一到「分」再比，杜绝浮点字符串比较
const expectedCents = order.amount;
const actualCents = yuanToCents(totalFee);   // "19.90" → 1990
if (expectedCents !== actualCents) { … }
```

`yuanToCents` 用 `Math.round(Number(yuan) * 100)`，并拒绝 `NaN`/负数/超过 2 位小数（防 `"19.9"` 与 `"19.90"` 的字符串差异，也防 `"19.999"` 静默截断）。

### 2.3 迁移 v8（需备份）

```sql
-- 1) 规范列亲和性：REAL → 语义 INTEGER（避免 SQLite 把 19.9 存成 REAL、1990 存成 INTEGER）
--    SQLite 无法直接改列类型，采用「新建-复制-替换」。
-- 2) 归一化存量 orders.amount：若存在非整数（小数元），×100 取整。
--    判据：SQLite 中 `typeof(amount)='real'` 或 `amount <> CAST(amount AS INTEGER)`。
```

**风险与回滚**：v8 会改写 `orders.amount` 与 `membership_prices` 的存量值。上线前必须 `cp` 数据文件备份（`db.ts:32` 的 `openDb` 已设 `chmod 600`，备份在同目录 `.bak`）；回滚 = 还原备份文件 + 回退代码。**先在 `m2-smoke` 的临时库上验证迁移，不动生产库。**

---

## 3. 令牌层设计

### 3.1 分层

```
views/styles/tokens.ts   TOKENS_CSS   :root{…} 唯一颜色/尺寸来源 + 过渡别名
views/styles/base.ts     reset / body / 排版 / .sr-only / .skip-link / 工具类
views/styles/shell.ts    .app / .sidebar / .topbar / .app-content / 抽屉 / 断点
views/styles/components.ts  按钮/卡片/指标卡/表格/徽章/筛选器/分段/表单/分页
views/styles/overlays.ts    弹窗 / Toast / 下拉菜单 / 遮罩
views/styles/charts.ts      图表卡 / 日志查看器 / 骨架屏
views/styles/auth.ts        认证页专用（原 AUTH_CSS 去重）
views/styles/index.ts       汇总导出
```

`layout.ts` 与 `authLayout()` 只 import `index.ts` 拼装 `<style>`，自身不再含 CSS 字面量。

### 3.2 过渡别名策略（D1 落地）

```css
:root {
  /* ── 新令牌（唯一真相源）── */
  --brand-primary: #0f1115;
  --surface-card: #f5f6f7;
  /* …design.md §3 全量… */

  /* ── 过渡别名（本批保留，P3 删除）── */
  --primary: var(--brand-primary);
  --bg-input: var(--surface-card);
  /* …design.md §11.3 映射表逐条… */
}
```

**别名不得在新代码中使用**。每批迁移后跑：

```bash
grep -rn 'var(--primary)\|var(--bg-input)\|…' dsh-hub/src --include='*.ts'   # 期望递减至 0
```

### 3.3 唯一允许的例外

`views/styles/tokens.ts` 是**唯一**可以出现颜色字面量的文件。其余文件的 `#hex`/`rgba()` 一律视为缺陷（`design.md` §10.5 自查 1）。图表绘制（`charts.ts`）若需按数据取值，只能引用令牌或用 `color-mix()`，不得内联新色值。

---

## 4. 骨架重构设计

### 4.1 结构（两端共用）

```html
<body class="app">
  <a class="skip-link" href="#main">跳到主要内容</a>
  <aside class="sidebar">…品牌 + nav…</aside>
  <header class="topbar">…汉堡 + 标题 + 用户菜单…</header>
  <main class="app-content" id="main">
    <div class="page-header"><h1 class="page-title">…</h1><p class="page-subtitle">…</p></div>
    …内容…
  </main>
</body>
```

### 4.2 导航项集合在单点收敛

现状靠 `layout.ts:919-928` 的三元组（`isAdmin`、`homeLink`、两个条件链接）区分角色。重构后改为一张声明表：

```ts
// views/nav.ts
const NAV_USER  = [{href:'/instances', label:'我的实例', icon:'instances'}, …];
const NAV_ADMIN = [{href:'/admin', label:'仪表盘', icon:'dashboard'}, …];
export function navItems(role: Role) { … }
```

用户端导航进侧边栏，管理端 8 项仍是侧边栏（**不是**第二套骨架），仅条目不同。

### 4.3 高度基准单点化

`--layout-topbar-height: 56px` 是全站唯一基准；`gateway.ts` 注入导航与 workspace loading 必须 `var()` 引用它，`100vh` 一律改 `100dvh`。验收：从 `/instances` 点进 `/workspace`，导航栏高度跳动 **0px**。

### 4.4 gateway 注入样式（易冲突，只做样式）

`renderHubNavStyle()`（`gateway.ts:430-527`）、`renderHubNavBar()`（`:553-565`）、`LANDING_PAGE_HTML`（`:23-38`）、workspace loading（`:627-644`）改为引用同一套令牌与 56px 基准。

⚠️ `gateway.ts` 曾被上游提交覆盖（2026-09-22 事件）。**只替换样式字符串，不整段取一侧**；改后必须回归 workspace loading 兜底页与落地页。

---

## 5. 分批落地与验证

| 批次 | 交付物 | 验证 |
|---|---|---|
| **P0-1** | `views/format.ts` 的 `formatMoney`/`yuanToCents`/`centsToYuan` | `scripts/format-selftest.mjs` 断言 1990→"¥19.90"、"19.90"→1990、"19.9"→1990、"19.999"→拒绝 |
| **P0-2** | `membership.ts` 回调比对 + 兜底单位、`api.ts:812`、`admin.ts:456`、`user.ts:409` | m2 冒烟 + 手工下单三处金额一致 |
| **P0-3** | `pages.ts:646-649` 封禁失败 flash | 手工：令 `disableUser` 抛错 → 页面红色提示且无成功态 |
| **P0-4** | 6 变量 + 14 class + 游离声明 | `design.md` §10.5 自查 1–2 条无输出；`/admin/prices`、`/payment/return` 有样式 |
| **P0-5** | `/payment/return` 三态 + 消除「支付成功/未激活」矛盾 | 未支付订单访问该页不显示「支付成功」 |
| **P1a** | `format.ts` 全量 + `components.ts` | 静态自查 6 条 + tsc |
| **P1b** | `styles/*` 拆分 + 别名 | 逐页视觉等价走查（除预期的卡片/按钮/输入框） |
| **P1c** | 骨架 + gateway 换肤 | 导航高度差 0px；workspace 兜底页正常 |
| **P2** | 组件换肤 + a11y 基础 | 375px 无横向滚动；Tab 走查；对比度扫描 |
| **P3** | 页面套用 + 图标 + 收敛 + 拆模块 | 每文件 ≤300 行；自查 1–5 条全空 |

### 验证命令（本机已实测可用）

```bash
cd dsh-hub && npx tsc -p . --noEmit                      # EXIT=0
TMPDIR=/data/dsh/home/.m2tmp bash scripts/m1-smoke.sh     # PASS=24 FAIL=0
TMPDIR=/data/dsh/home/.m2tmp bash scripts/m2-smoke.sh     # PASS=29 FAIL=0
```

> **环境注意**：`m2-smoke.sh:9` 用 `mktemp -d` 建 hub 数据根，而本机 `/tmp` 是 **256M tmpfs** —— 一个实例装 5 个插件即 254M，必然 ENOSPC。**必须显式设 `TMPDIR` 到数据盘**，否则失败与代码无关。另外 `startInstance` 在请求路径内同步装插件，`curl --max-time` 可能拿不到响应（表现为 `000`），属已知问题（Out of Scope 3），故障注入时不能把它当成本次改动引入。

---

## 6. 与既有变更的关系

| 变更 | 关系 |
|---|---|
| `openspec/changes/route-modularization` | P1b/P1c **可并行**（不动路由文件）；P3 的页面边界**必须复用**其 `page-*.ts` 划分，P3 等其定稿 |
| `openspec/specs/standards.md` §2 | 本提案的 P3 直接服务该条（视图 ≤300 行） |
| `openspec/specs/standards.md` §3.2 | 本提案**不**修 logout CSRF 缺口（Out of Scope 2），仅登记 |
| `docs/06-UI优化需求.md` | 需求编号（C/U/A/D-xx）在本变更 tasks.md 中沿用，便于双向追溯 |

## 7. 回归风险与对策

| 风险 | 对策 |
|---|---|
| 令牌改名漏改某处 → 静默失效 | 别名机制保证旧名仍生效；收口时用定义-引用差集**机器判定**（`grep -oE '--[a-z0-9-]+:'` vs `var(--…`），不靠人眼 |
| 骨架重构影响 Workspace iframe 高度 | `--layout-topbar-height` 单点收敛 + 从 `/instances` 进 `/workspace` 实测高度差 0px |
| gateway 注入样式被上游覆盖 | 只替换样式字符串；改后回归落地页/loading 页；提交信息标注触碰了 `gateway.ts` |
| m1/m2 冒烟因磁盘 ENOSPC 误报 | 验证命令固定带 `TMPDIR`；结果异常先查 `df -h $TMPDIR` |
| v8 迁移改坏存量金额 | 迁移仅在同一事务内做，且**先备份数据文件**；先在临时库上跑 m2 验证 |
