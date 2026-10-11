# UI 设计体系规范

本规范是为本变更**新增**的长期规范，归属 `openspec/specs/visual-system.md`。完整视觉取值见 `design.md`（§3 设计令牌、§4 组件规范）；本文件只规定**可验证的约束**。

## 术语

- **设计令牌（token）**：CSS 自定义属性形式的唯一取值来源，定义在 `views/styles/tokens.ts`。
- **SSR 产物**：服务端渲染出的 HTML 字符串（含内联 `<style>`）。
- **壳（shell）**：页面外层结构 —— 侧边栏 + 顶栏 + 内容区。
- **旧名 / 新名**：迁移前后同一视觉语义的令牌名，例：`--primary` → `--brand-primary`。

---

## Requirement: 令牌是唯一的取值来源

除 `views/styles/tokens.ts` 外，任何 SSR 产物中不得出现颜色字面量。

### Scenario: 禁止颜色字面量
- **Given** `dsh-hub/src` 下除 `views/styles/tokens.ts` 外的所有文件
- **When** 扫描 `#hex`、`rgb(`、`rgba(`、`hsl(`
- **Then** 匹配数为 `0`

### Scenario: 未定义变量禁止引用
- **Given** SSR 产物中的全部 `var(--x)` 引用
- **When** 与 `tokens.ts`（含过渡别名）中定义的 `--x:` 做差集
- **Then** 差集为**空**

### Scenario: 禁止 `!important`
- **Given** `dsh-hub/src` 下所有 CSS 字面量
- **When** 扫描 `!important`
- **Then** 匹配数为 `0`

### Scenario: 令牌命名空间
- **Given** `tokens.ts` 的 `:root` 块
- **When** 检查定义
- **Then** 颜色类令牌使用 `--brand-*` / `--text-*` / `--surface-*` / `--border-*` / `--status-*` 前缀
- **And** 尺寸类令牌使用 `--space-*` / `--fs-*` / `--radius-*` / `--dur-*` / `--shadow-*`
- **And** `--layout-*` 存放骨架几何（如 `--layout-topbar-height: 56px`）

---

## Requirement: 令牌过渡别名

迁移期必须保留旧名别名，使样式在新旧名下**同时生效**，并分批删除。

### Scenario: 别名指向新名
- **Given** `tokens.ts` 中声明为过渡别名的令牌
- **When** 查看其值
- **Then** 值为 `var(--新名)`（如 `--primary: var(--brand-primary)`）
- **And** 不重复写入具体色值

### Scenario: 别名不得在新代码中使用
- **Given** 本变更新增或修改的样式
- **When** 引用令牌
- **Then** 使用新名而非别名
- **And** 基线差异中别名引用计数只减不增

### Scenario: 别名分批删除后可机器验收
- **Given** 某个批次的别名被删除
- **When** 扫描 `dsh-hub/src`
- **Then** 该批旧名的引用数为 `0`
- **And** 定义-引用差集校验仍通过

---

## Requirement: 卡片是浅灰底、无阴影

卡片不得使用白底 + 投影；层次通过底色与留白表达。

### Scenario: 卡片底色与边界
- **Given** 概览卡、指标卡、表单卡、表格卡、图表卡
- **When** 渲染
- **Then** 背景为 `--surface-card`（`#f5f6f7`）
- **And** `box-shadow` 为 `none`
- **And** 圆角为 `--radius-md`（`8px`）
- **And** 内边距为 `--space-4`/`--space-5`

### Scenario: 投影只用于浮层
- **Given** 全站样式
- **When** 检查 `box-shadow`
- **Then** 仅弹窗、下拉菜单、Toast 及卡片 `:hover` 可使用 `--shadow-float` / `--shadow-modal`
- **And** 静态卡片不使用

### Scenario: 一个页面只有一处强调色
- **Given** 任一页面
- **When** 统计非中性色使用点
- **Then** 强调色（`--brand-accent`）只出现在**数据/图表**语义
- **And** 主色（`--brand-primary`，黑）只出现在**动作/主按钮**语义
- **And** 二者不得出现在同一元素上

---

## Requirement: 主按钮为黑底白字胶囊

### Scenario: 主按钮形态
- **Given** 页面的主行动按钮（保存、提交、下单、去充值）
- **When** 渲染
- **Then** 背景 `--brand-primary`、文字白、`--radius-full`
- **And** 高度落在令牌化尺寸（`32/36/40px` 档）

### Scenario: 仅两处允许胶囊
- **Given** 全站元素
- **When** 使用 `--radius-full`
- **Then** 仅筛选器/筛选胶囊与主 CTA 可胶囊化
- **And** 卡片、输入框、文字按钮、徽章使用 `--radius-*` 的较小档

### Scenario: 页内按钮形状统一
- **Given** 同一页面内存在多个按钮
- **When** 比较 `border-radius` 与高度
- **Then** 同类按钮取值一致
- **And** 不得出现「24px 胶囊 + 4px 直角」并存（现状 `layout.ts:256` vs `:268` 即为反例）

---

## Requirement: 按钮与输入框具备状态与焦点样式

### Scenario: 主按钮四态
- **Given** 主按钮
- **When** 处于默认 / hover / active / disabled
- **Then** 四态视觉可区分
- **And** `disabled` 具 `cursor: not-allowed` 与降透明，且不可点击

### Scenario: 输入框状态
- **Given** `.input` / `.textarea` / `.select`
- **When** 处于默认 / focus / invalid / disabled
- **Then** `focus` 显示 `--brand-accent` 边框或 `0 0 0 3px` 焦点环
- **And** `invalid` 显示 `--status-danger` 边框 + 错误文案
- **And** `disabled` 背景为 `--surface-sunken`

### Scenario: 禁止 `outline: none` 且无替代
- **Given** 所有可聚焦元素
- **When** 使用 `outline: none` 或 `outline: 0`
- **Then** 同一声明块内必须提供 `box-shadow`/`border-color` 焦点替代

### Scenario: placeholder 对比度
- **Given** `::placeholder`
- **When** 计算与输入框背景的对比度
- **Then** ≥ `4.5:1`

---

## Requirement: 布局骨架两端共用

### Scenario: 全站单一骨架
- **Given** 认证页之外的任一页面（含管理端 8 页）
- **When** 渲染
- **Then** 使用同一 `layout()` 骨架（侧边栏 + 顶栏 + 内容区）
- **And** 角色差异仅表现为导航条目集合不同（`navItems(role)`）
- **And** 管理端不得有第二套独立骨架

### Scenario: 顶栏高度单点定义
- **Given** 主站骨架与 `gateway.ts` 注入导航、workspace loading 页
- **When** 渲染
- **Then** 高度统一为 `var(--layout-topbar-height)`（`56px`）
- **And** 不得出现独立的 `60px` 等硬编码高度

### Scenario: 进入 workspace 高度不跳动
- **Given** 用户在 `/instances` 页
- **When** 点击进入 `/workspace`
- **Then** 导航栏高度差为 `0px`

### Scenario: 视口高度单位
- **Given** 全站样式
- **When** 使用高度单位
- **Then** 使用 `100dvh` 而非 `100vh`
- **And** 允许保留 `100vh` 作为 `dvh` 不支持时的回退声明且顺序在前

---

## Requirement: 组件样式单点定义

### Scenario: 同一样式不得重复定义
- **Given** `dsh-hub/src` 下所有 CSS 字面量
- **When** 提取选择器集合
- **Then** 同一选择器（含相同声明块）只在一处定义
- **And** 已发现的 `.auth-card` / `.form-control` 等 4 个类在 `layout.ts:445-481` 与 `:1037-1107` 重复定义的情况被消除

### Scenario: 状态徽章只有一份实现
- **Given** 用户端与管理端
- **When** 渲染实例状态徽章
- **Then** 二者调用同一函数
- **And** 不存在 `views/user.ts` 与 `views/admin.ts` 各写一份 `statusBadge()` 的情况

### Scenario: 表格列对齐
- **Given** 表格中的数值列（金额、端口、配额、计数）
- **When** 渲染
- **Then** 表头与单元格均右对齐
- **And** 文本列左对齐、时间列不换行

### Scenario: 表格有溢出容器
- **Given** 列数 ≥ 6 的表格
- **When** 在 375px 视口渲染
- **Then** 表格在自身容器内横向滚动
- **And** 页面本身不出现横向滚动

---

## Requirement: 响应式与可访问性基线

### Scenario: 375px 无横向滚动
- **Given** 视口宽度 `375px`
- **When** 访问认证页之外的全部用户端页面与管理端页面
- **Then** `document.scrollWidth <= 375`
- **And** 需要横向滚动的表格被包在滚动容器内

### Scenario: 移动端有导航入口
- **Given** 视口 ≤ `768px`
- **When** 渲染壳
- **Then** 侧边栏收起为抽屉/汉堡菜单，顶栏有打开控件
- **And** 不得仅 `display: none` 而不提供替代入口

### Scenario: 焦点可见性
- **Given** 用户按 `Tab` 遍历
- **When** 焦点落在任一可交互元素
- **Then** 存在可见焦点指示（对比度 ≥ `3:1`）
- **And** 实现使用 `:focus-visible`

### Scenario: 语义与 ARIA
- **Given** 弹窗、下拉菜单、加载态、图标按钮、数据表格
- **When** 渲染
- **Then** 弹窗有 `role="dialog"` + `aria-modal` + `aria-labelledby`，且支持 `Esc` 关闭与焦点限制
- **And** 下拉有 `aria-expanded` 与 `aria-haspopup`
- **And** 加载态有 `aria-busy` 或 `aria-live` 区域
- **And** 纯装饰图标有 `aria-hidden="true"`，有语义图标按钮有 `aria-label`
- **And** 表格使用 `<th scope>`，需要时提供 `<caption>` 或 `aria-label`

### Scenario: 提供跳转链接
- **Given** 键盘用户进入页面
- **When** 首次按 `Tab`
- **Then** 出现「跳到主要内容」链接
- **And** 指向内容区（`id="main"`）

### Scenario: 文本对比度
- **Given** 正文、次要文本、徽章文字、状态文字
- **When** 计算与背景的对比度
- **Then** 正文与次要文本 ≥ `4.5:1`
- **And** 现有 `#52c41a on #f6ffed`（≈2.2:1）与 `#1890ff on #e6f7ff`（≈2.95:1）被替换为达标取值

### Scenario: 尊重减少动效
- **Given** 存在 transition / animation
- **When** 用户在系统中开启「减少动态效果」
- **Then** `@media (prefers-reduced-motion: reduce)` 下动效被关闭或缩短至 `0.01ms`

### Scenario: 文案不依赖颜色
- **Given** 状态徽章、必填标记、错误提示
- **When** 颜色不可辨认时
- **Then** 仍能通过文字区分语义

---

## Requirement: 数据展示格式统一

### Scenario: 金额
- **Given** 分单位金额
- **When** 渲染
- **Then** 显示 `¥1,990.00` 形式（千分位 + 2 位小数）
- **And** 单位 `CNY` 以 `--fs-caption` + `--text-secondary` 紧随

### Scenario: 时间
- **Given** 数据库中的时间字段
- **When** 渲染
- **Then** 格式为 `YYYY-MM-DD HH:mm:ss`
- **And** 时区固定 `Asia/Shanghai`
- **And** 不得使用不指定时区的 `toLocaleString("zh-CN")`

### Scenario: 空值
- **Given** 字段值为 `null` / `undefined` / 空字符串
- **When** 渲染
- **Then** 统一显示 `—`
- **And** 不显示 `null`、`undefined`、`-`

### Scenario: 枚举中文化
- **Given** 实例状态、用户角色、审计动作、订单状态
- **When** 渲染
- **Then** 输出中文标签（如 `running` → `运行中`、`admin` → `管理员`、`user_create` → `创建用户`）
- **And** 不得直接输出英文枚举值

### Scenario: 大数字不缩写
- **Given** Token 数、请求数等大整数
- **When** 渲染
- **Then** 完整显示并使用千分位（`1,092,977,239`）
- **And** 不缩写为 `1.09B` / `109万`

### Scenario: 列表具备分页
- **Given** 用户列表、实例列表、订单列表、审计日志
- **When** 数据条数超过页大小
- **Then** 提供分页控件并显示总数
- **And** 服务端不得静默截断（现状审计日志硬 `LIMIT 200`、订单默认 50 条为反例）

---

## Requirement: 反馈与危险操作

### Scenario: 操作结果有反馈
- **Given** 任一写操作（保存、启停、封禁、删除、改价）
- **When** 操作完成
- **Then** 页面显示成功或失败提示（flash 或 Toast）
- **And** 失败时不得显示成功态

### Scenario: 失败不得被吞
- **Given** 服务端操作抛错
- **When** 处理请求
- **Then** 记录错误并以失败提示响应
- **And** 禁止 `catch { console.error(e) }` 后继续走成功分支（现状 `pages.ts:646-649` 封禁失败仍 redirect 为反例）

### Scenario: flash 不重复渲染
- **Given** 页面渲染流程
- **When** 存在 flash 消息
- **Then** 每条消息只渲染一次
- **And** 不得在 `layout()` 与页面函数中各渲染一次

### Scenario: 危险操作二次确认
- **Given** 删除实例、删除插件、封禁用户、改价、取消会员
- **When** 用户点击触发按钮
- **Then** 出现确认（非原生 `confirm()`）
- **And** 使用应用内弹窗组件，且具备 `role="dialog"` 与 `Esc` 关闭

### Scenario: 表单失败保留输入
- **Given** 表单提交失败
- **When** 重新渲染页面
- **Then** 已填内容被保留
- **And** 错误提示定位到出错字段（现状创建用户失败丢内容为反例）

### Scenario: 异步提交有加载态
- **Given** 提交类按钮
- **When** 请求进行中
- **Then** 按钮进入 disabled + loading 状态
- **And** 防止重复提交

---

## Requirement: 上下文转义与属性安全

### Scenario: 插值必须转义
- **Given** SSR 模板中的用户可控数据（订单号、支付单号、实例名、昵称）
- **When** 插入 HTML
- **Then** 经 `escapeHtml` 转义
- **And** 现有 `views/user.ts:591`（`order.order_no`）与 `:592`（`payment_order_id`）未转义处被修正

### Scenario: 内联事件处理器中的字符串标记
- **Given** `onsubmit` / `onclick` 内联属性中嵌入数据
- **When** 数据含引号
- **Then** 使用 `JSON.stringify` 并转义（或改为事件委托）
- **And** 不得依赖 HTML 实体转义（属性解析会还原裸引号，导致 `views/user.ts:83-87` 的删除确认可被实例名单引号绕过）

### Scenario: 提示文案不得来自未清洗的异常
- **Given** 服务端异常
- **When** 渲染错误提示
- **Then** 不将 `err.message` 直接输出到页面
- **And** 使用预定义用户可读文案（现状 `api.ts:717`、`pages.ts:223/305` 为反例）

---

## Requirement: 设计规范文档是唯一真相源

### Scenario: 文档与实现一致
- **Given** `design.md` 中列出的令牌与组件
- **When** 与 `views/styles/*.ts` 对比
- **Then** 命名与取值一致
- **And** 实现中新增令牌必须同步更新 `design.md`

### Scenario: 规范可机器自查
- **Given** 本变更交付的静态自查脚本
- **When** 在仓库根执行
- **Then** 覆盖「颜色字面量」「未定义变量」「`!important`」「重复选择器」「非 `Asia/Shanghai` 时间格式」「未转义插值」六类检查
- **And** 全部通过时退出码为 `0`
