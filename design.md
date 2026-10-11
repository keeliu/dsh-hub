# DSH Hub · UI 设计规范（Design Spec）

> **版本 v2**（2026-10-11）· 本文件是 DSH Hub 控制面样式的**唯一真相源（Single Source of Truth）**。
> **来源**：DeepSeek 开放平台「用量信息」控制台截图（1916×948 PNG，sha256 `a1e692867dfb613ad29a972d2a7a50d6c65a7b983df6c926f7956e2382f483ab`）。
> **整合说明**：本文件由两份早期草稿（像素实测版设计规范 + 组件/实现版 design.md）整合而成，**两份草稿已并入本文件并删除、不再单独维护**，**取色一律以像素实测为准**；整合时又对 25 个关键点位与全局颜色直方图做了独立复核（脚本解码 PNG 的 IDAT → zlib 解压 → 反 filter → 逐像素统计），复核结论见 §2.3，其中修正了旧文两处错误（横幅动作按钮是**蓝**不是黑；侧边栏宽度是 **241px**）。
> **适用范围**：DSH Hub 控制面 —— 用户端（认证页、`/instances`、`/instances/:id`、`/membership`、`/payment/return`、`/profile`、Workspace 外壳）+ 管理后台 `/admin/*`（8 页）+ 网关注入的导航与落地页。
> **不适用范围**：dsh 实例内部的 DSH Web UI（不在本仓库，网关只注入导航与重写路径）。
> **硬约束（全文生效）**：运行时零依赖（**禁止** CDN / Web 字体 / 图标字体 / CSS 框架 / 图表库 / 前端构建步骤）；Node.js ≥ 24 + 纯 TypeScript ESM；全部样式为 SSR 模板字符串内联 CSS；单视图模板文件 ≤ 300 行（`openspec/specs/standards.md` §2）；与待办变更 `route-modularization` 的拆分方案并行兼容；窄屏可用 + 触控友好。

---

## 1. 设计理念

这套视觉语言的核心不是「好看」，而是**把大量数字读得下去**。五条可复用的判断标准：

1. **容器极轻，内容极重。** 卡片没有边框、没有阴影，只靠一层比白略暗的填充（`#f5f6f7`）与 24px 留白分区。视线落在数字上，不落在框线上。
2. **一个页面只有一处强调。** 整页的品牌蓝只出现在最需要被点的那个元素上（或数据图表里）；其余全是黑、灰、白。强调色出现两次以上就不再是强调。
3. **不居中，不铺满。** 正文左对齐、固定最大宽度；指标卡横向等分；只有「空状态」和「价格」这类需要仪式感的位置才居中。
4. **数字是主角，单位是配角。** 大数字用近似等宽的数字字形（`tabular-nums`）、600–700 字重；单位（CNY / 次 / tokens）小一号、灰色、与大数字基线对齐。
5. **层级只靠灰阶，不靠装饰。** 标题 / 正文 / 辅助 = 近黑 / 深灰 / 中灰，三级灰阶完成全部层级；不用下划线、不用色块、不用图标轰炸。

**反面清单（明确不做）**：渐变大面积铺底、彩色边框卡片、圆角超过 16px 的容器、纯黑 `#000`、多色徽章彩虹、阴影超过两层、装饰性旋转/缩放动画。

**三条工程推论**（本仓库落地时最容易走样的地方）：

- **黑 = 动作，蓝 = 数据。** `#0f1115`（近黑）只用于按钮与标题；`#3b82f6`/`#3c65df`（蓝）只用于图表、链接、进度、焦点环。现有仓库把蓝色同时当按钮色和数据色（`--primary: #0066cc` 一处两用），是「哪里都能点」的视觉噪音来源。
- **状态不靠颜色。** 所有状态徽章必须同时有文字与色块；色盲用户与灰度打印下仍可读。
- **强调色只允许一次。** 一屏内 `.btn--primary` 最多 1 个；列表行内操作一律 `ghost`/`outline`。

---

## 2. 证据基线与实测数据

### 2.1 证据分级

| 级别 | 含义 | 本文标记 |
|---|---|---|
| **实测** | 从截图像素直接采样/直方图得到，带来源坐标或频次 | 不带标记 |
| **推导** | 由实测值归纳出的比例、序列、梯度，或按 4px 网格取整 | 标注「推导」 |
| **建议** | 本仓库落地时的工程决策，非截图原始属性 | 标注「建议」 |

字体族**无法**从位图确认（截图为中文 + 拉丁混排，字形为中性无衬线、字腔开放，与系统 UI 字体栈渲染特征一致），故只给系统字体栈。**不引入 Web 字体** —— 控制台类产品首屏时间比字形个性重要，且与「运行时零依赖」定位一致。

### 2.2 实测颜色频次（本次独立复核，全图 3473 种颜色）

| 色值 | 像素数 | 占比 | 归属 |
|---|---|---|---|
| `#ffffff` | 972111 | 53.52% | 主内容区底、分段控件选中块 |
| `#f5f6f7` | 479302 | 26.39% | **卡片底、指标卡底、输入框底、筛选器底** |
| `#f9fafb` | 225345 | 12.41% | **侧边栏底** |
| `#e4edfd` | 49837 | 2.74% | 提示条底 |
| `#0f1115` | 9134 | 0.50% | **主按钮底（导出 / 去充值）+ 标题字** |
| `#ebeef2` | 9049 | 0.50% | 导航选中块底 |
| `#f1f1f1` | 7728 | 0.43% | 图表网格线 / 输入描边 |
| `#3b82f6` | 7057 | 0.39% | 图表柱（系列一） |
| `#c1c1c1` | 6397 | 0.35% | 图标线条 / 轴标签 |
| `#3c65df` | 5316 | 0.29% | 图表柱（系列二，更深） |
| `#3964fe` | 2695 | 0.15% | **横幅内的动作按钮（「知道了」，蓝底白字）** |
| `#d2d8e5` | 2508 | 0.14% | 图表网格线（深一档） |
| `#fef5e7` | 2204 | 0.12% | 行内提示 chip「余额预警未开启 去设置」的底 |
| `#e5e8ea` | 1916 | 0.11% | 整幅宽 1px 分割线（像素数恰为 1916 = 图宽） |
| `#e9ecf2` | 1090 | 0.06% | 分段控件容器底 |
| `#e5e5e5` | 942 | 0.05% | 页面级 1px 分割线（实测值） |

文字灰阶实测簇：`#0f1115`（标题最暗像素）/ `#2a2c30` / `#67686a` / `#81858c` / `#9094a2` —— 三级灰阶的原始证据（反锯齿使同一段文字出现多个相邻灰值）。

**点位复核（本次采样）**：侧边栏 `(20,600)`、`(120,470)`、`(220,600)` 均为 `#f9fafb`；主区 `(1700,250/600/900)` 均为 `#ffffff`；概览卡 `(800,240)`、`(1400,215)` 与指标卡 `(950,470)`、`(1500,470)` **同为 `#f5f6f7`**；导航选中块 `(200,110)` = `#ebeef2`；提示条 `(1300,150)` = `#e4edfd`；图表柱 `(1445,690)` = `#3b82f6`。侧栏右缘 `x=228–236` 无分割线（连续 `#f9fafb`）；卡片外沿外侧为纯白，**无投影**。

### 2.3 与旧文档的差异裁定

| 争议点 | 旧 `design.md`（组件版） | `docs/05`（实测版） | **本次复核裁定** |
|---|---|---|---|
| 侧边栏底色 | 纯白 | `#f9fafb` | ✅ **`#f9fafb`**（3 点采样一致） |
| 卡片 | 白底 + 1px 描边 | `#f5f6f7` 填充、无边框无阴影 | ✅ **`#f5f6f7` 填充**（概览卡与指标卡同值；外沿无投影） |
| 品牌蓝 | `#4D6BFE` | `#3b82f6` / `#3c65df` | ✅ **`#3b82f6`（系列一）/ `#3c65df`（系列二）** |
| 墨黑 | `#17181A` | `#0f1115` | ✅ **`#0f1115`**（标题最暗像素 + 主按钮底均为该值） |
| 横幅动作按钮 | 黑色药丸 | 黑色药丸 | ❌ **两者皆错 → `#3964fe` 蓝底白字**（区域众数 `#3964fe×1197`，白字 `#ffffff×75`） |
| 侧边栏宽度 | 232px | 241px | ✅ **241px**（内容区起始 x=241） |
| 正文区宽度上限 | — | ≈1470px | ✅ **≈1470px**（内容止于 x≈1786 / 视口 1916） |
| 主按钮 | 黑药丸 | 黑药丸 | ✅ 一致（「导出」`#0f1115×1241`、「去充值」`#0f1115×1264`） |

---

## 3. Design Tokens

> 命名采用语义分层：`--surface-*` / `--text-*` / `--brand-*` / `--state-*` / `--fs-*` / `--space-*` / `--radius-*` / `--shadow-*` / `--dur-*`。
> 落地方式：新建 `dsh-hub/src/views/styles/tokens.ts` 导出 `TOKENS_CSS`（`String.raw` 模板串），作为**唯一**颜色/尺寸来源。现有 `--primary` 等按 §11.3 迁移并保留一轮过渡别名。

### 3.1 画布与表面

| 令牌 | 值 | 用途 |
|---|---|---|
| `--surface-canvas` | `#ffffff` | 主内容区底、弹窗 |
| `--surface-sunken` | `#f9fafb` | 侧边栏、表头 |
| `--surface-card` | `#f5f6f7` | 卡片、指标卡、输入框底、筛选器底 |
| `--surface-hover` | `#f0f1f3` | 行悬浮、次级按钮悬浮 |
| `--surface-active` | `#ebeef2` | 导航选中项、分段控件容器 |
| `--surface-raised` | `#ffffff` | 分段控件选中块（在灰容器内以白提亮） |

### 3.2 描边

| 令牌 | 值 | 用途 |
|---|---|---|
| `--border-hairline` | `#f0f1f3` | 卡片内部分隔、表格行边 |
| `--border-divider` | `#e5e5e5` | 页面级 1px 分割线（实测） |
| `--border-strong` | `#e5e7eb` | 需要明确边界时（下拉、弹窗、输入框描边） |

> ⚠️ **与现状相反**：现有 `.card` 是**白底 + `--shadow-card` 阴影**（`views/layout.ts:231-245`），规范要求**浅灰底 + 无边框无阴影**。这是整套改造里视觉差异最大的一处，必须整体切换，不能只改一两张卡。

### 3.3 文字

| 令牌 | 值 | 用途 | 对白底对比度 |
|---|---|---|---|
| `--text-title` | `#0f1115` | 页面标题、大数字（**非纯黑**） | 18.6:1 ✅ |
| `--text-body` | `#1f2937` | 正文 | 14.5:1 ✅ |
| `--text-secondary` | `#6b7280` | 副标题、表头、辅助说明、单位 | 4.8:1 ✅ AA |
| `--text-tertiary` | `#9ca3af` | 占位符、禁用态 | 2.8:1 ⚠️ **仅限非关键信息** |
| `--text-inverse` | `#ffffff` | 深色/彩色底上的文字 | — |

### 3.4 品牌与状态

| 令牌 | 值 | 用途 |
|---|---|---|
| `--brand-primary` | `#0f1115` | **主按钮底色**、强调动作（黑） |
| `--brand-primary-hover` | `#2a2c30` | 主按钮悬浮（派生；替代原 `--primary-hover`） |
| `--brand-accent` | `#3b82f6` | 数据可视化主色（图表柱系列一）、链接、焦点环 |
| `--brand-accent-strong` | `#3c65df` | 图表柱系列二 / 实心强调（实测占比第二高） |
| `--brand-accent-soft` | `#e4edfd` | 提示条底、选中浅底 |
| `--brand-cta` | `#3964fe` | **浅蓝底上的动作按钮**（横幅「知道了」类，白字 4.74:1 ✅） |
| `--state-success` | `#16a34a` | 成功（压深，替代原 `#52c41a`） |
| `--state-warning` | `#d97706` | 警告（浅底上必须压深，见 §5.5） |
| `--state-danger` | `#dc2626` | 危险、删除、倒计时 |
| `--state-info` | `#2563eb` | 信息 |

**两张蓝不能混用**：`--brand-accent`/`--brand-accent-strong` 用于**数据**，`--brand-cta` 仅用于**浅蓝底上的填充按钮**，`--brand-primary`（黑）用于**其余全部动作**。

### 3.5 字体

```css
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
             'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
--font-mono: 'SF Mono', Monaco, 'Cascadia Code', Menlo, Consolas, monospace;
--font-numeric: tabular-nums;   /* 所有数字列的 font-variant-numeric */
```

### 3.6 字号与字重

| 令牌 | 字号 / 行高 | 字重 | 用途 |
|---|---|---|---|
| `--fs-page-title` | 24px / 1.35 | 600 | 页面标题（实测 24–26px） |
| `--fs-section` | 18px / 1.4 | 600 | 卡片标题、区块标题 |
| `--fs-metric-lg` | 32px / 1.15 | 600 | 关键指标大数字 |
| `--fs-metric` | 24px / 1.2 | 600 | 卡片内数字 |
| `--fs-body` | 14px / 1.6 | 400 | 正文（默认） |
| `--fs-sm` | 13px / 1.5 | 400 | 表格、次要信息、筛选器 |
| `--fs-caption` | 12px / 1.5 | 400 | 单位、注释、时间戳、徽章 |

**硬约束**：输入框字号在**移动端（<768px）不得小于 16px**（否则 iOS 聚焦自动放大页面）；中文字号不得小于 12px；数字与单位字号比固定 **2:1 ~ 2.4:1**（如 32px 数字配 13–16px 单位）。

### 3.7 间距（4px 基准网格）

允许值**仅**：`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`。

| 令牌 | 值 | | 令牌 | 值 |
|---|---|---|---|---|
| `--space-1` | 4px | | `--space-5` | 24px |
| `--space-2` | 8px | | `--space-6` | 32px |
| `--space-3` | 12px | | `--space-7` | 48px |
| `--space-4` | 16px | | `--space-8` | 64px |

| 场景 | 值 |
|---|---|
| 卡片内边距 | 24px（紧凑 `.card--metric` 16px） |
| 卡片之间 | 24px |
| 标题与副标题 | 8px |
| 页面标题区与首块内容 | 32px |
| 表单项之间 | 16px |
| 区块之间（含分割线上下） | 48px |
| 按钮内边距 | 10px 20px（小号 6px 12px） |

### 3.8 圆角

| 令牌 | 值 | 用途 |
|---|---|---|
| `--radius-xs` | 4px | 徽章、标签 |
| `--radius-sm` | 6px | 紧凑按钮、输入框 |
| `--radius-md` | 8px | **卡片、按钮、输入框、弹窗（默认）** |
| `--radius-lg` | 12px | 大容器、图表卡、弹窗 |
| `--radius-pill` | 999px | 胶囊：主按钮、筛选器、分段控件 |

**唯一允许胶囊的场景是「筛选器」与「主要 CTA」**。卡片、弹窗、输入框一律 `--radius-md`。现有仓库把**输入框做成 24px 胶囊**（`views/layout.ts:299`，`--radius-full: 24px`，根本不是真胶囊）—— 这是本规范要纠正的重点之一。

### 3.9 阴影

| 令牌 | 值 | 用途 |
|---|---|---|
| `--shadow-none` | `none` | **卡片默认（不用阴影）** |
| `--shadow-hover` | `0 1px 2px rgba(16,24,40,.06)` | 卡片/导航项悬浮 |
| `--shadow-float` | `0 4px 12px rgba(16,24,40,.08)` | 下拉菜单、分段控件选中块 |
| `--shadow-modal` | `0 16px 48px rgba(16,24,40,.16)` | 弹窗 |

实测依据：卡片边缘无明显投影（卡片外侧采样为纯白）。现有 `--shadow-card: 0 2px 8px rgba(0,0,0,.08)`（`views/layout.ts:40`）→ 改为 `none`；`--shadow-elevated` → `--shadow-float`（降不透明度）。

### 3.10 动效

| 令牌 | 值 |
|---|---|
| `--ease` | `cubic-bezier(.4, 0, .2, 1)` |
| `--dur-fast` | `120ms`（悬浮、选中） |
| `--dur-base` | `200ms`（展开、切换） |
| `--dur-slow` | `320ms`（弹窗进出） |

**禁止**：元素位移超过 4px 的悬浮动画（现有 `.btn:hover{transform:translateY(-1px)}`，`views/layout.ts:262`，可保留但不得加大）、旋转/缩放装饰动画、超过 400ms 的等待感动画。所有动效必须在 `prefers-reduced-motion: reduce` 下降为 `none`。

### 3.11 焦点环

```css
--focus-ring: 0 0 0 3px rgba(59,130,246,.28);
--focus-outline: 2px solid var(--brand-accent);
--focus-offset: 2px;
```

全站统一：`:focus-visible { outline: var(--focus-outline); outline-offset: var(--focus-offset); }`。表单控件聚焦用 `border-color: var(--brand-accent)` + `box-shadow: var(--focus-ring)`。

### 3.12 布局常量与 z-index

```css
--layout-sidebar-width: 240px;      /* 实测 241px，按 4px 网格取整（推导） */
--layout-content-max: 1470px;       /* 实测 ≈1470px */
--layout-topbar-height: 56px;       /* 全站唯一基准，含 Workspace 注入导航 */
--layout-header-gap: 32px;
--z-base: 0; --z-sticky: 10; --z-dropdown: 100; --z-drawer: 200;
--z-modal: 300; --z-toast: 400;
```

### 3.13 断点

| 名称 | 视口 | 布局行为 |
|---|---|---|
| `xs` | < 480px | 单列；表格转卡片列表；弹窗底部升起；侧边栏折叠为抽屉 |
| `sm` | 480–767px | 单列；指标卡 2 列；输入框 16px |
| `md` | 768–1023px | 指标卡 3 列；侧边栏抽屉化 |
| `lg` | 1024–1439px | 双栏完整布局 |
| `xl` | ≥ 1440px | 内容最大宽度封顶 1470px，两侧留白 |

`@media (hover: hover)` 守卫所有 hover 态，避免触摸端「粘滞 hover」。

---

## 4. 布局系统

### 4.1 双栏骨架（实测）

| 部位 | 实测值 | 说明 |
|---|---|---|
| 侧边栏宽度 | **241px**（内容区起始于 x=241） | 固定宽，不随视口缩放 |
| 侧边栏背景 | `#f9fafb` | 与主区白底仅差 2–3% 明度，边界感来自色差而非分割线 |
| 主区背景 | `#ffffff` | 纯白 |
| 主区内容左内边距 | ≈75px（内容起于 x≈316，减侧栏 241） | 推导为 72/80px 网格值 |
| 主区内容最大宽度 | ≈1470px（内容止于 x≈1786 / 视口 1916） | 宽视口下内容有上限，不铺满 |
| 内容区顶部留白 | ≈53px 到标题基线 | 推导 |

**骨架结构**（两端共用，仅导航项集合不同）：

```html
<body class="app">
  <a class="skip-link" href="#main">跳到主要内容</a>
  <aside class="sidebar">…品牌 + nav…</aside>          <!-- 桌面固定；<768px 抽屉 -->
  <header class="topbar">…汉堡 + 标题 + 用户菜单…</header><!-- 桌面隐藏；<768px 52px -->
  <main class="app-content" id="main">
    <div class="page-header"><h1 class="page-title">…</h1><p class="page-subtitle">…</p></div>
    …页面内容…
  </main>
</body>
```

- `.app-content { width:100%; max-width: var(--layout-content-max); margin: 0 auto; padding: var(--space-6) var(--space-6) var(--space-7); }` —— **禁止 `!important`**（现状 `views/layout.ts:214-219` 的 `.container` 四连 `!important` + 960px 上限是管理端表格在**桌面端就溢出**的根因）。
- 管理端与用户端不再需要两套骨架：删除 `.navbar`（`views/layout.ts:69-119`）与 `.admin-layout`/`.admin-sidebar`/`.admin-content`（`views/layout.ts:483-523`）。

### 4.2 侧边栏导航

| 属性 | 规格 |
|---|---|
| 项高 | 40px，左右内边距 12–16px，项间距 4px |
| 选中态 | 整块填充 `--surface-active` `#ebeef2`，圆角 8px，加 `aria-current="page"` |
| 未选中态 | 无背景、无边框，图标 + 文字同为中灰（≈`#6b7280`） |
| 图标 | 线性风格、16–18px 视觉尺寸，与文字间距 10px（见 §8） |
| 分组 | 用 40px 以上空白分隔，**不使用分割线**（实测侧栏无可见分割线） |
| 移动端 | <768px 转抽屉：汉堡按钮 + 遮罩 + Esc 关闭 + 焦点陷阱；**禁止 `display:none`**（现状 `views/layout.ts:906`） |

### 4.3 主区结构（自上而下）

```
页面标题（--fs-page-title / 600）
   └ 副标题（--fs-sm / 400 / --text-secondary）：时间口径、延迟说明、口径注释
提示条（可选，--brand-accent-soft 底 / 圆角 8px / 右端一个蓝色胶囊按钮）
概览卡区（2 列等分，间距 24px）
─────────────── 极细分割线（--border-divider，1px，上下留白 48px）
工具条（左：若干胶囊筛选器；右：黑色主按钮 + 图标按钮）
指标卡区（3 列等分，间距 24px）
图表卡（整宽）
```

**关键细节**：概览卡与指标卡**背景同为 `#f5f6f7`**，但视觉重量不同 —— 概览卡高（≈110px）、字号大、含次要信息；指标卡矮（≈90px）、只有一个数字。**它们不是两种组件，是同一种卡片的两种密度**：共用 `.card` 基底 + `.card--metric` 修饰类，而非写两套样式。

---

## 5. 组件规范

> 类名约定：块 `.block`，元素 `.block-el`，修饰 `.block--variant`，状态 `.is-open` / `.is-hidden` / `[aria-current]`。**禁止**内联样式承载布局（见 §10.3）。

### 5.1 按钮 `.btn`

| 变体 | 底色 | 文字 | 边框 | 圆角 | 用途 |
|---|---|---|---|---|---|
| `.btn--primary` | `--brand-primary` `#0f1115` | `#fff` | 无 | pill | 页面唯一主操作 |
| `.btn--secondary` | `--surface-card` | `--text-body` | 无 | pill | 次操作、取消 |
| `.btn--ghost` | 透明 | `--text-secondary` | 无 | md | 工具条图标按钮 |
| `.btn--outline` | 透明 | `--text-body` | 1px `--border-strong` | md | 中性操作 |
| `.btn--danger` | 透明 → 悬浮填充 `#fee2e2` | `--state-danger` | 1px `--state-danger` | md | 删除、封禁 |
| `.btn--cta` | `--brand-cta` `#3964fe` | `#fff` | 无 | pill | 浅蓝底上的动作（横幅） |
| `.btn--link` | 透明 | `--brand-accent` | 无 | 无 | 表格内跳转 |

尺寸：`.btn` 高 36px（内边距 10px 20px）/ `.btn--sm` 高 32px（6px 12px）/ `.btn--lg` 高 44px。**移动端（<768px）所有可点击按钮最小 44×44px**（现状 `.btn-sm` 约 34px，`views/layout.ts:277`，而实例列表 4 个操作按钮全用它，`views/user.ts:70/76/80/86`）。

**硬约束**：
- 一屏内 `.btn--primary` 最多 1 个；列表行内操作全部用 `ghost`/`outline`。
- 现有 `.btn-danger` 的 4px 圆角 + 12px 字号（`views/layout.ts:268`）**必须并入统一体系**，不得与胶囊按钮同屏并列。
- 所有按钮必须有可见焦点样式（§3.11）。
- 状态：`hover` 仅换底色（位移 ≤1px），`active` 下沉 1px，`disabled` 降不透明度至 .5 且 `cursor: not-allowed`，`loading` 时 `disabled` + 文案「保存中…」。

### 5.2 卡片 `.card`

```
背景 --surface-card，圆角 --radius-md，内边距 24px，无阴影，无边框
标题 .card-title：--fs-section / 600 / 下方 16px 间隔（不用分割线）
```

密度变体：`.card--metric`（内边距 16px，只有一个大数字 + 标签）；`.card--flush`（内边距 0，用于包表格）。

### 5.3 指标卡 `.metric`

```
┌────────────────────────────┐
│ 充值余额 ⓘ  [余额预警未开启 去设置]│  ← --fs-sm / --text-secondary / 可含行内 chip
│ ¥3.15 CNY                  │  ← --fs-metric-lg 600 --text-title + --fs-sm --text-tertiary
└────────────────────────────┘
```

- 数字左对齐（**不居中**），单位紧贴数字右侧、基线对齐。
- 数字必须 `font-variant-numeric: tabular-nums`。
- 2–3 个一组横向等分（`.grid-metrics`），4 个以上在 <768px 折行为 2 列。
- 行内 chip（如「余额预警未开启 去设置」）用 `#fef5e7` 底 + `--text-body`，圆角 `--radius-xs`。

### 5.4 表格 `.table`

- 表头：`--surface-sunken` 底、`--fs-sm`、`--text-secondary`、**无大写转换**（中文不适用）。
- 单元格：14px、`--text-body`、行高 ≥44px、`1px --border-hairline` 底边；padding 12px 16px（现状 `1rem` 偏大，`views/layout.ts:329`）。
- **必须**用 `.table-wrap { overflow-x: auto; }` 包裹（现状全 `views/layout.ts` 只有 `.log-viewer` 有 `overflow-x`，表格一律裸奔）。
- 移动端（<768px）：优先改为**卡片列表**（每行一张卡，字段名 + 值上下排列），而非横向滚动。
- 数字列右对齐 + `tabular-nums`；长串（订单号、实例 ID）加 `word-break: break-all`。
- 表头 `<th scope="col">`，表格有 `<caption class="sr-only">` 或 `aria-label`。
- 空状态居中：图标 + 一句话 +（可选）主操作。
- 分页：底部「共 N 条，第 X/Y 页」+ 上一页/下一页（见 §5.17）。

### 5.5 徽章 `.badge`

| 语义 | 底色 | 文字色 | 对比度 |
|---|---|---|---|
| success | `#dcfce7` | `#15803d` | 4.6:1 ✅ |
| warning | `#fef3c7` | `#b45309` | 4.9:1 ✅ |
| danger | `#fee2e2` | `#b91c1c` | 5.3:1 ✅ |
| info | `#dbeafe` | `#1d4ed8` | 5.1:1 ✅ |
| neutral | `--surface-hover` | `--text-secondary` | 4.8:1 ✅ |

圆角 `--radius-xs`，内边距 2px 8px，字号 `--fs-caption`，字重 500，固定行高 20px（含 1px 同族描边）。
现状 `#52c41a on #f6ffed` = **2.2:1**、`#1890ff on #e6f7ff` = **2.95:1**（`views/layout.ts:352-356`）不达标。

**文案必须中文化**（现状 `statusBadge()` 直接输出 DB 英文原值，`views/user.ts:25-35`、`views/admin.ts:55-67`）：

| DB 值 | 文案 | | DB 值 | 文案 |
|---|---|---|---|---|
| `running` | 运行中 | | `starting` | 启动中 |
| `stopped` | 已停止 | | `stopping` | 停止中 |
| `active` | 正常 | | `failed` | 失败 |
| `disabled` | 已封禁 | | 其他 | 未知（**不回显原文**） |

角色：`user` → 用户、`admin` → 管理员、`root` → 超级管理员。会员：`trial` → 体验会员、`monthly` → 月度会员、`yearly` → 年度会员、`none` → 无。订单：`paid` → 已支付、`pending` → 待支付、其他 → 未知。

### 5.6 筛选器与分段控件

- **胶囊下拉 `.pill-select`**：`--surface-card` 底、圆角 pill、高 32px、`--fs-sm`、左标签 `--text-secondary` + 右值 `--text-body` + 内联 SVG 箭头。**删除** `data-URI` 箭头（`views/layout.ts:315` 的 `fill='%23666'`）。
- **分段控件 `.segmented`**：容器 `--surface-active` 底 + 圆角 pill；选中块 `--surface-raised` 白底 + `--shadow-float`（实测 `#e9ecf2` 容器 + 白块）。
- 两者只用于**筛选与视图切换**，不得用于表单提交。键盘：方向键切换 + `aria-pressed`。

### 5.7 提示条 `.banner`

- 底色 `--brand-accent-soft` `#e4edfd`、圆角 8px、内边距 12px 16px、无边框。
- 文字 `--fs-sm` `--text-body`；行尾放 `.btn--cta` 蓝色胶囊动作按钮（实测 `#3964fe` + 白字）。
- 可选左侧图标槽；可关闭时右端常驻关闭图标按钮（`aria-label="关闭"`）。
- **页面级 flash 消息复用此组件**：按语义换左侧 3px 竖条 + 图标（success/danger/warning/info），底色保持浅色系。**flash 只允许在 `layout()` 单点渲染一次**（现状管理端又拼进 content，见 §11.2）。

### 5.8 弹窗 `.modal`

- 遮罩 `rgba(16,24,40,.45)`；内容 `--surface-canvas`、圆角 12px、`--shadow-modal`、内边距 24px、宽度 `min(400px, calc(100vw - 32px))`、`max-height: calc(100dvh - 64px)` + `overflow-y: auto`。
- **必须**：`role="dialog"` `aria-modal="true"` `aria-labelledby`、Esc 关闭、打开时焦点移入、关闭后焦点归还触发元素、Tab 焦点陷阱。
- **必须**：移动端从底部升起（bottom sheet），触控目标 ≥44px。
- **危险确认变体** `.modal--danger`：标题为「确定封禁用户 X？」，正文说明不可逆后果（例：封禁将停止其全部实例并吊销全部会话与令牌，`api.ts:478-491`），主按钮为**动词**（「封禁」而非「确定」）+ `.btn--danger`，次按钮「取消」。

### 5.9 Toast `.toast`

右上角浮出，`--shadow-float`，圆角 8px，宽 320px，4s 自动消失；语义色仅用于左侧 3px 竖条 + 图标，底色统一白色；容器 `aria-live="polite"`。**替代所有 `alert()`**（现状价格页 `views/admin.ts:589/593`、插件页 `:686/687`）与「需要整页刷新才能看到结果」的操作反馈。

### 5.10 表单 `.field`

- 标签在输入框上方，`--fs-sm`、`--text-body`、与输入框间距 8px，**必须有 `for`/`id` 关联**（现状 `views/admin.ts` 全文件 0 个 `<label for=>`）。
- 输入框：`--surface-card` 底、**圆角 6–8px（非胶囊）**、内边距 10px 12px、14px（移动端 16px）、1px `--border-strong` 描边（或 0 描边 + 填色，同一页面保持一致）。
- 聚焦：`border-color: var(--brand-accent)` + `box-shadow: var(--focus-ring)`。**禁止** `outline: none` 且无替代（现状 `views/layout.ts:308-311`）。
- 错误：字段下方 `--fs-caption` `--state-danger` 文案 + 输入框 1px 红边 + `aria-describedby` + `role="alert"`；错误出现时保留已填值（现状创建用户失败整页重渲染且表单默认 `display:none`，`views/admin.ts:147/149`）。
- 只读/禁用态用 `--text-tertiary`；密钥类字段用 `type="password"` + 「已配置」占位，**不回显明文**。

### 5.11 空状态 `.empty-state`

内联 SVG 图标（40px，`--text-tertiary`）+ 一句话（`--fs-body` `--text-secondary`）+ 可选主操作按钮；垂直居中，上下留白 48px。**禁止**用空 `<div>` 靠 `font-size` 撑高（现状 `views/user.ts:41`）或用 emoji 当图标（现状 `views/layout.ts:408-411`）。

### 5.12 日志查看器 `.log-viewer`

深色底 `#0f1115` + `#e9ecef` 文字，等宽字体（`--font-mono`），`--fs-caption`，行高 1.6，`overflow: auto`，`max-height: 480px`，`white-space: pre-wrap`。**不提供**下载/清空（避免越权接口）。

### 5.13 价格/套餐卡 `.plan-card`

- 三栏 `.grid-plans`（`minmax(280px,1fr)`），间距 24px；<768px 单列。
- 卡：`--surface-card` 底、`--radius-md`、24px 内边距；**推荐档用 1px `--brand-accent` 描边 + 「推荐」徽章**，不用放大/阴影/渐变。
- 价格：`--fs-metric-lg` 600 `--text-title` + `tabular-nums`；原价 `--fs-sm` `--text-tertiary` 删除线；「免费」用 `--brand-primary` 而非已被废弃的 `--color-primary`（现状 `views/layout.ts:591/596/598` 三个令牌全未定义）。
- 功能列表：每行 `--fs-sm`，勾选图标 `--state-success`，`aria-hidden`。

### 5.14 会员状态条 `.membership-bar`

`--surface-card` 底 + `--radius-md` + 16px 内边距；左侧图标 20px，中间类型（`--fs-body` 600）+ 到期时间（`--fs-caption` `--text-tertiary`），右侧动作按钮。激活态左侧图标用 `--state-success`、失效态 `--state-warning`；**同时显示文字**（不靠颜色）。

### 5.15 图表卡 `.chart-card`

- 整宽 `.card`，标题 `--fs-section` + 右侧 `.segmented`（模型 / API Key）。
- **无第三方图表库**：用内联 SVG 或 `<canvas>` + 手写绘制，柱子用 `--brand-accent` / `--brand-accent-strong`，圆角 2px 顶端；网格线 `--border-hairline`（实测 `#f1f1f1` / `#d2d8e5`）。
- Y 轴标签 `--fs-caption` `--text-tertiary`，水平网格线 1px，**无线框、无背景色块**。
- 空数据显示「暂无数据」而不是空白坐标系。
- 提供 `<figcaption>` 或 `aria-label` 概述数据（「9/12 至 10/11 消费金额，峰值 32 元」）。

### 5.16 用户菜单 `.user-menu`

触发器：头像 + 昵称 + 箭头，`<button type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="user-menu">`（现状 `views/layout.ts:931` 三样全缺）。菜单：`role="menu"`，项 `role="menuitem"`，`--surface-canvas` 底 + `--shadow-float` + 圆角 8px；**Esc 关闭 + 关闭后焦点归还触发器**；危险项（退出登录）用 `--state-danger`。

### 5.17 分页 `.pagination`

底部左「共 N 条，第 X/Y 页」，右「上一页 / 下一页」`.btn--outline`；当前页 `aria-current="page"`；数据被截断时（如 LIMIT）**必须显式提示**「仅显示最近 200 条」（现状 `pages.ts:719` 硬编码 LIMIT 200 且 UI 无任何说明，`membership.ts:246-248` 默认 50 条静默截断且 `pages.ts:834` 不传参）。

---

## 6. 页面模板

> 每页骨架按 §4.3；下文只列**该页特有**的部分。路由与渲染函数见括号内证据。

### 6.1 用户端

| 页面（路由 · 渲染函数） | 骨架要点 |
|---|---|
| 首启向导 `/setup`（`pages.ts:118/127` · `auth.ts:15-53`） | 认证布局；说明段 + 3 个字段 + 主按钮；已有用户时 302 `/login` |
| 登录 `/login`（`pages.ts:181/194` · `auth.ts:56-88`） | 认证布局；主按钮 `.btn--primary`；底部链接组（忘记密码 / 注册，注册开关由 `registration_open` 决定） |
| 注册 `/register`（`pages.ts:229/240` · `auth.ts:91-136`） | 同登录；关闭注册时 302 |
| 忘记密码 `/forgot-password`（`pages.ts:342/347` · `auth.ts:139-161`） | 邮箱 + 发送验证码；成功文案恒定（防枚举） |
| 重置密码 `/reset-password`（`pages.ts:370/381` · `auth.ts:164-197`） | 验证码 + 新密码；成功 303 登录 |
| 首页 `/`（`pages.ts:424`） | 无 UI：会员有效 → `/workspace`，否则 → `/membership` |
| 实例列表 `/instances`（`pages.ts:434` · `user.ts:38-111`） | `.page-header`（h1「我的实例」+ 副标题「共 N 个实例」）+ 右侧 `.btn--primary`「新建实例」→ `.grid-metrics` 配额卡（实例数 / 并发运行，**带中文标签**）→ `.card--flush` 包 `.table-wrap` + 7 列表格（名称 / 状态徽章 / 端口 / 版本 / 创建时间 / 最近启动 / 操作）→ 空态「还没有实例」+ 主 CTA。操作按钮 `.btn--ghost` 并达 44px。<768px 转卡片列表 |
| 新建实例 `/instances/new`（`pages.ts:443/451` · `user.ts:114-141`） | `.card` 表单（名称 + 可选 DSH 版本）+ 「创建」`/`「取消」；失败保留已填值 |
| 实例详情 `/instances/:id`（`pages.ts:470` · `user.ts:144-209`） | `.page-header`（实例名 + 状态徽章 + 操作组 启动/停止/重启）+ `.kv` 信息卡（端口 / 版本 / Trusted Host / 创建时间 / 最近启动）+ 访问入口卡（外链 `target="_blank" rel="noopener noreferrer"`）+ 日志卡（`.log-viewer`，最近 200 行）+ 危险区卡（`.btn--danger` 删除实例，二次确认）。**404 兜底分支必须传 `csrf`**（现状 `pages.ts:476` 漏传 → 该页所有表单点启动/删除必 403 `csrf_invalid`） |
| 会员购买 `/membership`（`pages.ts:785` · `user.ts:244-552`） | `.page-header` → `.grid-plans` 三栏 `.plan-card`（体验 / 月度 / **年度·推荐**）→ 支付弹窗 |
| 支付弹窗（`user.ts:323-358` + 脚本 `:361-537`） | `.modal` 规范 + `role="dialog"`；二维码 `<img alt="支付二维码">` + 金额（`formatMoney`）+ 10 分钟倒计时（`--state-danger`，用 `--state-danger` 替代未定义的 `--color-error`）+ 状态区 `aria-live="polite"` + 轮询 + 「取消 / 我已支付」；宽度 `min(320px, calc(100vw - 32px))` + `max-height` + `overflow-y:auto` |
| 支付结果 `/payment/return`（`pages.ts:795` · `user.ts:646-681`） | **整页缺样式**（`.payment-return*`、`.membership-badge`、`.membership-expire` 全仓 0 定义）→ 补齐：结果图标（成功 ✓ / 待确认 ⏱ / 失败 ✕）+ 标题（「支付成功」）+ 说明（订单号、金额、会员到期时间）+ 动作组（「查看订单」`/profile`、「返回首页」`/`）。**同时修逻辑矛盾**：现状无条件渲染「支付成功」而下方徽章显示「未激活」（`user.ts:659-661`） |
| 个人中心 `/profile`（`pages.ts:804` · `user.ts:555-644`） | `.membership-bar` → 身份卡（头像 48px + 昵称 + `.kv` 列表）→ 订单表（订单号 / 金额 / 状态徽章 / 创建时间 / 支付时间，`formatMoney` + `formatDateTime`）→ 空态 |
| 工作区外壳 `/workspace`、`/workspace/*`（`pages.ts:816/822` · `gateway.ts`） | 满屏 iframe；高度 `calc(100dvh - var(--layout-topbar-height))`（现状 `views/layout.ts:226` 硬编码 60px 与 56px 错位 4px）；注入导航同批换肤 |
| 403 / 404（`pages.ts:560`） | 走统一 `layout()`，`.empty-state` 风格 + 返回首页按钮；**403 现状是裸 `<h1>403 - 无权访问</h1>`**，不走布局 |

### 6.2 管理端

| 页面（路由 · 渲染函数） | 骨架要点 |
|---|---|
| 侧边栏（`admin.ts:70-93`） | 8 项：仪表盘 / 用户管理 / 实例总览 / 会员管理 / 价格管理 / 预置插件 / 审计日志 / 全局设置。**emoji 换内联 SVG**（现状 `admin.ts:72-79` 的 📊👥📦💎💰🧩📋⚙️），`<nav aria-label="后台导航">`，当前项 `aria-current="page"` |
| 仪表盘 `/admin`（`pages.ts:567` · `admin.ts:100-132`） | `.page-header` + `.grid-metrics` 3 指标卡（用户总数 / 实例总数 / 运行中实例，**数值用 `--text-title` 而非蓝色**）+ 图表卡（近 30 天实例/用户增长）+ 「最近审计」列表卡 + 「查看全部」链接 + 3 个快捷入口 |
| 用户管理 `/admin/users`（`pages.ts:577/586` · `admin.ts:135-253`） | 工具条（`.pill-select` 角色/状态筛选 + 搜索框 + 右侧 `.btn--primary`「创建用户」）→ 表格 9 列（ID / 昵称 / 账号 / **邮箱** / 角色（中文）/ 状态徽章 / 会员 / 配额（**带标签「实例 / 并发」**）/ 创建时间（到秒）/ 操作）→ 行内「主操作 + ⋮ 菜单」（编辑 / 设会员 / 封禁）→ 分页 + 空态。创建表单改为 `.card` 内联展开，失败保留已填值 + 字段级错误 |
| 实例总览 `/admin/instances`（`pages.ts:665` · `admin.ts:256-311`） | 工具条（属主 / 状态筛选 + 搜索）→ 6 列表格（ID / 名称 / 属主 / 状态 / 端口 / 操作 启动·停止·删除）→ 分页 + 空态 |
| 审计日志 `/admin/audit`（`pages.ts:716` · `admin.ts:314-347`） | 工具条（时间范围 + 动作类型筛选 + 搜索）→ 表格 5 列（时间 / **操作者昵称** / **动作中文标签（tooltip 保留原文码）** / **目标用户** / 详情（`title` + 可展开））→ 显式「仅显示最近 200 条」+ 分页 |
| 会员/订单 `/admin/membership`（`pages.ts:831` · `admin.ts:433-480`） | 统计卡（本月收入 / 订单数）+ 工具条（状态 / 时间筛选 + 导出）→ 8 列表格（订单号 / 支付订单号 / 用户昵称 / 会员类型 / 金额（`formatMoney`）/ 状态 / 创建时间 / 支付时间）→ 显式「共 N 条」+ 分页 |
| 价格管理 `/admin/prices`（`pages.ts:840` · `admin.ts:482-600`） | **6 个 class 全仓无定义**（`price-row`/`price-field`/`price-label`/`input-group`/`input-prefix`/`input-suffix`，`admin.ts:495-557`）→ 按 §5.10 实现：`.card` + 3 行 `.price-row`（会员类型 / 售价 / 原价，`¥` 用 `.input-prefix` 而非独立的 `input-group`）→ 保存按钮 + 二次确认 + Toast（**替代 `alert()` + `location.reload()`**）；表单字段全部加 `required`（现状 trial 两输入缺，`admin.ts:500/508`）、复用 `csrfField()`（现状手写未转义，`admin.ts:491`）、魔数默认值提为常量 |
| 预置插件 `/admin/plugins`（`pages.ts:849` · `admin.ts:603-692`） | 说明段 + `.card--flush` 表格 5 列（包名 spec / 启用 / 允许构建脚本 / workspace / 操作 ↑↓·删除）+ 「新增插件」+ 「保存清单」→ 删除二次确认 + 未保存离开提醒（`beforeunload` + 页内提示条）+ 保存 Toast/loading |
| 全局设置 `/admin/settings` + `/settings/payment`（`pages.ts:724/755` · `admin.ts:350-415`） | 分组卡：基础设置（注册开关 / 默认版本 / 允许版本列表）+ 支付配置（AppID / AppSecret（`type=password` + 「已配置」）/ 支付网关）→ 保存 Toast；**flash 只渲染一次** |

---

## 7. 数据展示规范

控制面 90% 的内容是数字和时间。

| 类型 | 规范 | 示例 |
|---|---|---|
| 金额 | 前导 `¥`、两位小数、千分位；单位 `CNY` 小一号灰色 | `¥266.84 CNY` |
| 大额 | 万/亿单位换挡，保留 2 位有效小数 | `109.29 万` |
| 计数 | 千分位 | `7,053` |
| 大计数 | 千分位完整展示（不缩写，实测 `1,092,977,239` 全展示） | `1,092,977,239` |
| 百分比 | 一位小数 + `%` | `86.7%` |
| 时间（绝对） | `YYYY-MM-DD HH:mm:ss`，**显式 `Asia/Shanghai`** | `2026-10-11 09:26:41` |
| 时间（相对） | 7 天内用「3 小时前 / 昨天 14:20」，超出用绝对时间 | `3 小时前` |
| 时长 | `1天2小时` / `52分钟` | `52分钟` |
| 空值 | 统一 `—`，**不显示 `null`/`undefined`/空字符串** | `—` |
| 状态枚举 | 中文标签（§5.5） | `运行中` |
| 数字对齐 | 所有数字列右对齐 + `font-variant-numeric: tabular-nums` | — |
| 金额单位 | 一律以 `formatMoney(cents)` 出参；**禁止**裸 `.toFixed(2)` | `¥19.90` |

**硬约束**：禁止直接渲染毫秒时间戳或 `Date.toString()`；禁止在用户端与管理端对同一字段采用不同单位（现状 `admin.ts:456` 未除 100 vs `user.ts:594` 除 100，**同一订单金额相差 100 倍**）。

**工具函数契约**（建议落在 `dsh-hub/src/views/format.ts`，纯函数、无依赖、可单测）：

```ts
formatMoney(cents: number): string      // 1990 → "¥19.90"
formatNumber(n: number): string         // 7053 → "7,053"
formatDateTime(ts: number|string): string  // 显式 Asia/Shanghai
formatDate(ts: number|string): string
formatRelative(ts: number|string): string
formatDuration(ms: number): string
formatEmpty(v: unknown): string         // null/undefined/'' → "—"
statusLabel(s: string): string; statusBadge(s: string): string
roleLabel(r: string): string; membershipLabel(m: string): string
auditActionLabel(a: string): string
```

---

## 8. 图标与插画

### 8.1 规则

1. **禁止 emoji 当图标**（现状管理端侧边栏 `admin.ts:72-79`），跨平台渲染不一致且无 `aria-hidden`。
2. **禁止图标字体 / 图标库 / CDN**（零依赖硬约束）。
3. **禁止 `data-URI` SVG 嵌在 CSS 里**（现状 `select` 箭头，`views/layout.ts:315`）——改用内联 SVG 元素。
4. 全部内联 SVG：`viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`、`stroke-linecap="round"`、`stroke-linejoin="round"`、`stroke-width="1.5"`（16px 尺寸）/ `1.75`（20–24px）。
5. 纯装饰图标必须 `aria-hidden="true" focusable="false"`；承担语义的图标按钮必须 `aria-label`。
6. 图标尺寸统一 16 / 20 / 24 / 40（空状态）四档。

### 8.2 实现契约

```ts
// dsh-hub/src/views/icons.ts
type IconName = 'dashboard' | 'users' | 'instances' | 'membership' | 'prices'
              | 'plugins' | 'audit' | 'settings' | 'plus' | 'search' | 'close'
              | 'chevron-down' | 'chevron-right' | 'check' | 'alert' | 'info'
              | 'trash' | 'play' | 'stop' | 'restart' | 'external' | 'logout'
              | 'menu' | 'arrow-up' | 'arrow-down' | 'copy' | 'clock' | 'calendar'
              | 'money' | 'user' | 'lock' | 'mail' | 'chart' | 'filter' | 'download'
              | 'empty-box' | 'wifi-off' | 'shield' | 'spinner';
export function icon(name: IconName, size?: 16|20|24|40, extraClass?: string): string;
```

`icon()` 返回形如 `<svg class="icon icon--16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" …>…</svg>`。

### 8.3 首批必换清单

侧边栏 8 个（仪表盘/用户/实例/会员/价格/插件/审计/设置）、用户菜单 3 个（用户/退出/箭头）、表格操作 4 个（启动/停止/重启/删除）、工具条 4 个（搜索/筛选/导出/新增）、分页 2 个（上/下）、反馈 3 个（成功/警告/危险）、空态 1 个（`empty-box`）、加载 1 个（`spinner`，`prefers-reduced-motion` 下不旋转）、品牌字标 1 个。共 36 个。

---

## 9. 可访问性（强制）

1. 正文对比度 ≥ 4.5:1，大字号（≥18.66px 粗体 / 24px 常规）≥ 3:1。徽章、提示、占位符一律纳入检查。
2. **所有交互元素有可见焦点环**（`:focus-visible`），不得只依赖 `outline: none` + 底色变化（现状 `views/layout.ts:308-311` 是 1.1:1 的底色差）。
3. 所有图标按钮、关闭按钮必须有 `aria-label`；下拉必须有 `aria-expanded` / `aria-haspopup` / `aria-controls`。
4. 弹窗、抽屉、菜单键盘可达：Esc 关闭、Tab 循环、焦点归还触发元素。
5. 表单错误、flash 消息加 `role="alert"` / `aria-live="polite"`。
6. 尊重 `prefers-reduced-motion: reduce`（现状 3 处动画无降级：`views/layout.ts:262`、`:820`、`gateway.ts:634`）。
7. 语义标签：`<nav>` `<main>` `<aside>` `<table>`（带 `<thead>` + `scope`），标题层级不跳级（h1 → h2 → h3），**每页恰好一个 `h1`**。
8. 颜色不是唯一信息载体（状态徽章必须带文字；进度/图表必须在文本中复述）。
9. 跳转链接 `.skip-link` 指向 `#main`，聚焦时可见。
10. 表单字段必须有 `<label for>` 关联（现状 `views/admin.ts` 一个都没有）。

---

## 10. 实现约定

### 10.1 零依赖与 SSR 内联

所有样式是 TS 模板字符串里的内联 `<style>`；无构建步骤、无 CSS 文件、无 `class` 名压缩。**禁止**任何第三方域名请求（`grep` 断言：页面 HTML 中无 `http://` / `https://` 的外部资源引用）。

### 10.2 样式模块拆分（与 `route-modularization` 合并）

`views/layout.ts` 现 1117 行（其中 `CSS` = `:11-908` 898 行、`AUTH_CSS` = `:1017-1117` 101 行未导出），违反 `standards.md` §2 的「视图 ≤300 行」。目标结构：

| 文件 | 内容 | 预算 |
|---|---|---|
| `views/styles/tokens.ts` | `TOKENS_CSS`（`:root` + 过渡别名） | ≤120 行 |
| `views/styles/base.ts` | reset、`body`、排版、`.sr-only`、`.skip-link`、工具类 | ≤180 行 |
| `views/styles/shell.ts` | `.app` / `.sidebar` / `.topbar` / `.app-content` / 抽屉 / 断点 | ≤240 行 |
| `views/styles/components.ts` | 按钮、卡片、指标卡、表格、徽章、筛选器、分段、表单、分页 | ≤290 行 |
| `views/styles/overlays.ts` | 弹窗、Toast、下拉菜单、遮罩 | ≤180 行 |
| `views/styles/charts.ts` | 图表卡、日志查看器、骨架屏 | ≤140 行 |
| `views/styles/auth.ts` | 认证页专用（原 `AUTH_CSS`，去重后） | ≤120 行 |
| `views/styles/index.ts` | 汇总导出，供 `layout()` / `authLayout()` 使用 | ≤40 行 |
| `views/icons.ts` | `ICONS` + `icon()` | ≤260 行（每图标压缩为 3–6 行 `d` 路径） |
| `views/format.ts` | §7 的数据格式化纯函数 | ≤180 行 |
| `views/components.ts` | `statusBadge` / `roleLabel` / `emptyState` / `pagination` / `modal` / `toast` 等共享片段 | ≤280 行 |

页面层按 `views/auth-*.ts`（5 页）、`views/user-*.ts`（实例/会员/支付/个人中心）、`views/admin-*.ts`（8 页 + `admin-sidebar.ts`）拆分，边界与 `route-modularization` 的 `page-*.ts` 一一对应。

### 10.3 命名与内联样式

- 类名：块 `.card`、元素 `.card-title`、修饰 `.card--metric`、状态 `.is-open` / `.is-hidden` / `[aria-current="page"]`。
- **禁止**用内联 `style=` 承载布局（现状约 90 处：`views/admin.ts` 47 处、`views/user.ts` 39 处、`gateway.ts` 3 处、`views/layout.ts:939` 1 处）。布局→工具类（`.stack` / `.row` / `.row-between` / `.grid-2` / `.grid-3` / `.is-hidden`）；颜色→令牌。
- 弹窗显隐用 `.is-open` 类切换，不用内联 `display`。

### 10.4 插值与 HTML 安全

- **所有 `${}` 插值必须包 `escapeHtml()`**（`http.ts:40-47`）；例外仅限内部生成的固定 HTML 片段常量。
- **禁止**把插值放进内联事件处理器的 JS 字符串：`onsubmit="return confirm('…${escapeHtml(name)}…')"` 不可用 —— `escapeHtml` 只做 HTML 转义（`'`→`&#39;`），HTML 属性解析会先还原成裸单引号，含单引号的实例名（实例名无字符集限制，`instances.ts:61`）会让内联处理器编译失败被忽略，**确认框被静默绕过**（现状 `views/user.ts:84`、同款 `views/admin.ts:297`）。
- 替代做法：`data-*` 属性传参 + 事件委托，或统一 `.modal--danger` 组件。
- 外链一律 `target="_blank" rel="noopener noreferrer"`（现状 `views/user.ts:192`、`345` 缺 `rel`）。

### 10.5 静态自查（迁移完成后必须为空 / 达标）

```bash
# 1) 除令牌文件外，不允许颜色字面量
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' dsh-hub/src/views --include='*.ts' \
  | grep -v 'views/styles/tokens.ts'
# 2) 不允许未定义的 var()
grep -rho 'var(--[a-z0-9-]*)' dsh-hub/src | sort -u   # 每个都要能在 tokens.ts 找到
# 3) 无障碍不能是零
grep -rn 'aria-\|role=\|tabindex' dsh-hub/src/views | wc -l   # 期望 > 0
# 4) 不用 emoji 当图标
grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' dsh-hub/src/views
# 5) 不出现内联事件
grep -rn 'on[a-z]*="' dsh-hub/src/views
# 6) 类型检查
npx tsc -p . --noEmit
```

---

## 11. 与 DSH Hub 现状的差距

### 11.1 差距总览

| 维度 | 现状（实测） | 规范 | 差距 |
|---|---|---|---|
| 卡片 | 白底 + `0 2px 8px` 阴影（`views/layout.ts:231-245`） | `#f5f6f7` 底 + 无阴影 | **相反** |
| 输入框圆角 | 24px 胶囊（`views/layout.ts:299`） | 6–8px | 大 |
| 主按钮 | `#0066cc` 蓝底胶囊（`views/layout.ts:265`） | `#0f1115` 黑底胶囊 | 大 |
| 数据色 | 与按钮同蓝 | 独立 `--brand-accent` `#3b82f6` | 中 |
| 侧边栏 | 深色导航栏 `#1a1a1a` + 白字（`views/layout.ts:69-78`） | 浅色侧栏 `#f9fafb` + `#ebeef2` 选中块 | 大 |
| 页面宽度 | 960px 且四连 `!important`（`views/layout.ts:214-219`） | 内容区 ≈1470px、按断点封顶、无 `!important` | 中 |
| 字号序列 | 12/14/16/20/24 | 12/13/14/18/24/32 | 中 |
| 阴影层级 | 2 级（card / elevated） | 4 级（none / hover / float / modal） | 中 |
| 状态文案 | 英文原始值（`views/user.ts:34`、`views/admin.ts:66`） | 中文标签 | 小（但用户可感知） |
| 焦点样式 | 基本缺失（`views/layout.ts:308-311`） | 强制 | 大 |
| 动效降级 | 无 `prefers-reduced-motion` | 强制 | 小 |
| 无障碍属性 | `views/` 下 `aria-*`/`role`/`tabindex` 命中数 **0** | §9 全部 | 大 |
| 骨架语义 | 只有 `<nav>` + `<div class="container">`，**无 `<main>`/`<footer>`**（`views/layout.ts:988`，与 `:4` 注释不符） | `<aside>` + `<main>` + 语义标题 | 中 |

### 11.2 四处结构性缺陷（与令牌无关，属实现层）

1. **三套设计语言并存**：主站（浅色 + `#0066cc`）、gateway 注入导航（`#1a1a1a` 深色 + 60px，`gateway.ts:430-517`）、Workspace/落地页（深蓝 `#1a1a2e` + 亮青 `#00d9ff`，`gateway.ts:637-641`）。从 Hub 点进 Workspace 时配色与圆角突变。**必须统一**：`renderHubNavStyle()`（`gateway.ts:430-527`）、`renderHubNavBar()`（`:553-565`）、`LANDING_PAGE_HTML`（`:23-38`）、workspace loading（`:627-644`）全部改为引用同一套令牌。注意 `gateway.ts` 是易冲突文件（见 `AGENTS.md` 的 2026-09-22 上游覆盖事件），改动**只做样式注入、不整段取一侧**。
2. **导航高度三个基准值**：`56px`（`views/layout.ts:73`）、`60px`（`gateway.ts:438/514/562`）、`calc(100vh - 56px)`（`views/layout.ts:486`），另有废弃的 `.workspace-container{calc(100vh - 60px)}`（`views/layout.ts:226`）。统一为 `--layout-topbar-height: 56px`，`100vh` → `100dvh`。
3. **令牌分叉**：`gateway.ts:510` 用 `var(--danger, #dc3545)`，fallback 与 `--danger: #ff4d4f`（`views/layout.ts:32`）不一致 → 统一用 `--state-danger`。
4. **未经定义的引用静默失效**：6 个 `var()`（`--text-muted` `views/admin.ts:154`、`--color-text-tertiary` `views/layout.ts:591`、`--font-size-2xl` `:596`、`--color-primary` `:598`、`--color-error` `:868`、`--gray-600` `:1052`/`:1099` 与 `views/user.ts:64/65/130/150`）+ 6 个 class（`price-row` / `price-field` / `price-label` / `input-group` / `input-prefix` / `input-suffix`，`views/admin.ts:495-557`）→ 价格页完全无样式。另有两段**选择器外裸声明**（`views/layout.ts:197-198`、`:209-211`）会让后续解析错位、让「后者覆盖前者」的改动静默失效。

### 11.3 令牌迁移映射表

| 现有（`views/layout.ts:12-56`） | 新令牌 | 处置 |
|---|---|---|
| `--primary: #0066cc` | `--brand-primary: #0f1115` | **改值**（按钮转黑）；蓝移入 `--brand-accent` |
| `--primary-hover: #0052a3` | `--brand-primary-hover: #2a2c30` | 改值 |
| `--bg-body: #ffffff` | `--surface-canvas` | 改名 |
| `--bg-input: #f5f5f5` | `--surface-card: #f5f6f7` | 改名 + 改值 |
| `--bg-sidebar: #ffffff` | `--surface-sunken: #f9fafb` | **改值** |
| `--bg-navbar: #1a1a1a` | — | 深色导航**废弃** |
| `--bg-page: #f5f5f5` | `--surface-hover: #f0f1f3` / `--surface-card` | 拆分为两个语义 |
| `--text-primary: #1a1a1a` | `--text-title: #0f1115` / `--text-body: #1f2937` | 拆分为两级 |
| `--text-secondary: #666666` | `--text-secondary: #6b7280` | 微调 |
| `--text-placeholder: #999999` | `--text-tertiary: #9ca3af` | 改名 |
| `--text-white: #ffffff` | `--text-inverse` | 改名 |
| `--success: #52c41a` | `--state-success: #16a34a` | **压深以满足 4.5:1** |
| `--danger: #ff4d4f` | `--state-danger: #dc2626` | 压深 |
| `--warning: #faad14` | `--state-warning: #d97706` | 压深 |
| `--info: #1890ff` | `--state-info: #2563eb` | 压深 |
| `--border: #e8e8e8` | `--border-divider: #e5e5e5` / `--border-hairline: #f0f1f3` / `--border-strong: #e5e7eb` | 细分为三级 |
| `--shadow-card` | `--shadow-none` | **删除**（卡片不再用阴影） |
| `--shadow-elevated` | `--shadow-float` | 改值，降不透明度 |
| `--radius-sm: 4px` | `--radius-xs: 4px` | 改名 |
| `--radius-md: 8px` | `--radius-md: 8px` | 保持（默认） |
| `--radius-lg: 12px` | `--radius-lg: 12px` | 保持 |
| `--radius-full: 24px` | `--radius-pill: 999px` | **改值**（24px 不是真胶囊） |
| `--font-family` | `--font-sans` | 改名 + 补中文回退 |
| `--font-size-base: 14px` | `--fs-body: 14px` | 改名 |
| `--font-size-sm: 12px` | `--fs-caption: 12px` | 改名 |
| `--font-size-lg: 16px` | `--fs-section: 18px` | **改值**（16px 作区块标题偏小） |
| `--font-size-xl: 20px` | `--fs-metric: 24px` | 改值 |
| `--font-size-xxl: 24px` | `--fs-page-title: 24px` / `--fs-metric-lg: 32px` | 拆分 |
| （缺失） | `--fs-sm: 13px` | **新增**（表格正文字号） |
| （缺失） | `--space-1..8` / `--focus-*` / `--z-*` / `--dur-*` / `--ease` / `--layout-*` | **新增** |
| `--gray-600` 等 6 个未定义 | 按 §3 归位 | **修复引用** |

**迁移策略（分批可验证）**：新令牌用**新名字**全量引入，旧变量保留为过渡别名（`--primary: var(--brand-primary)`），逐页替换调用点后删除别名。这样每批提交都能独立验证，避免一次改 1000 行 CSS 的长尾风险。

### 11.4 迁移顺序

| 阶段 | 内容 | 理由 |
|---|---|---|
| **0** | 修 §11.2 的 4 处结构性缺陷 + `/payment/return` 缺失样式 | 「可见破损」，用户直接看到白板/错位 |
| **1** | 令牌层落地（`styles/tokens.ts` + 过渡别名） | 一次替换全站生效，性价比最高 |
| **2** | 骨架重构（`.app` / `.sidebar` / `.topbar` / `.app-content`，含 gateway 注入导航同批） | 卡片/按钮/输入框换肤必须在骨架上做 |
| **3** | 组件层换肤（按钮、卡片、指标卡、表格、表单、徽章、筛选器） | 视觉主体验收点 |
| **4** | 页面层拆分 + 逐页套用（§6） | 与 `route-modularization` 共用页面边界 |
| **5** | 删除过渡别名 + 静态自查（§10.5）+ 无障碍与 375px 走查 | 收口 |

**并行关系**：阶段 1–3 只碰 `views/styles/*` 与 `views/layout.ts`，与 `route-modularization`（拆 `api.ts` 1085 行 / `pages.ts` 918 行 / `views/layout.ts` 1117 行）互不冲突；阶段 4 必须与之共用同一套页面边界，避免二次搬迁。

---

## 12. 验收清单

- [ ] `styles/tokens.ts` 是唯一颜色来源；§10.5 的自查 1–5 条全部无输出
- [ ] 卡片全部无 `box-shadow`、无 1px 描边（浮层除外，且只用 `--shadow-xs/sm/pop` 三级）
- [ ] 输入框圆角 6–8px；主按钮为黑底白字胶囊；浅蓝横幅按钮为蓝底白字
- [ ] 每个 `dsh-hub/src/views/**` 文件 ≤ 300 行
- [ ] 键盘 Tab 走完「登录 → 实例列表 → 新建 → 详情 → 删除确认」与「后台登录 → 用户管理 → 封禁确认」，焦点环始终可见
- [ ] 375px 宽：`document.scrollingElement.scrollWidth <= clientWidth`；触控目标 ≥44×44；侧边栏可开合
- [ ] 所有数值列 `tabular-nums` 且右对齐；金额与计数格式来自 `format.ts`
- [ ] 状态一律「色块 + 中文文案」，不依赖颜色；无英文枚举外泄
- [ ] `prefers-reduced-motion: reduce` 下无位移动画、骨架屏不脉冲
- [ ] 危险操作均有二次确认且主按钮为动词
- [ ] 200% 浏览器缩放无内容截断
- [ ] 全站 Network 面板零第三方域名请求
- [ ] 工作区页面无残留深色顶栏（§11.2 第 1、2 条已同批修改）
- [ ] `/payment/return`、`/admin/prices` 两处「无样式页面」渲染正常
