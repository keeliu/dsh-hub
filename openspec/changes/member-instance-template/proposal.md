# 变更提案：会员实例预置插件自动装载

## Why（为什么做）

用户创建 DSH 实例后，默认需要**逐个安装预设插件**（`dsh plugin add`），每个插件可能来自 npm 或 GitHub，且部分含原生编译（如 `node-pty`），单实例耗时可达数分钟。用户从「创建实例」到「能正常使用带插件的工作空间」等待过长，体验差，也容易在启动阶段因插件未就绪而失败。

**目标**：在实例创建阶段就**自动、快速、可靠**地把一整套预设插件装载进该用户实例的独立 `DSH_HOME`，保证实例首次启动即可用。

## 现状：三层递进装载，但复制不完整、常量重复

当前 `instances.ts` + `supervisor/spawn.ts` 已经实现「模板复制 → 异步安装 → 启动兜底」三层机制（见 `instances.ts:copyPreinstalledPlugins` / `installDefaultPlugins`、`spawn.ts:startInstance`），但存在两个缺陷：

1. **复制不完整**：`copyPreinstalledPlugins()` 只复制 `模板/node_modules` 和 `.npmrc`，且把插件复制到 `homePath/node_modules`（顶层），而 DSH 实际从 `$DSH_HOME/profiles/web/node_modules` 加载插件。复制目标路径与 DSH 真实 profile 布局不一致；也没有复制 `profiles/web/*.{json,yml,yaml}` 配置文件与关键的 `profiles/node_modules/` 共享依赖。
2. **常量重复**：`DEFAULT_PLUGINS` 在 `instances.ts` 与 `spawn.ts` 各定义一份，容易不同步；`TEMPLATE_DSH_HOME` 在 `instances.ts` 直接读 `process.env`，违反 `standards.md` §4.2「除 config.ts 外任何模块不得直接访问 process.env」。

因为复制不完整，真正把插件装进 `profiles/web` 的往往是异步安装/启动兜底（逐包 `dsh plugin add`），而「模板快复制」只在少数路径下提前写好 `.plugins-installed`，反而可能跳过完整安装 —— 属于「想快但复制不全」的中间态。

## 方案决策（两根轴，分别选择）

| 决策轴 | 结论 | 选择理由 |
|---|---|---|
| **模板如何生产** | **方案 B：Docker 多阶段构建** | 全自动、可重复、模板版本与镜像版本绑定、构建期路径无关，不依赖服务器上已有的 DSH 安装 |
| **运行时如何装载** | **方案 A：保留复制架构，只修复复制逻辑** | 改动最小、不引入外部 `dshp` 工具依赖、保留现有异步创建流程；方案 B（`dshp import` 重构）改动大且依赖工具可用性 |

## What Changes（做什么）

1. **模板生产（Docker）**：在 `dsh-hub/Dockerfile` 增加 `template-builder` 阶段，用 `DSH_HOME=/opt/dsh-home-template` 预装全部默认插件，产出 `/opt/dsh-home-template`；最终镜像 `COPY` 该目录，并设置 `TEMPLATE_DSH_HOME` 环境变量。
2. **修复 `copyPreinstalledPlugins()`**：改为复制**整个 `profiles/` 目录树**（含 `profiles/web/*` 配置与插件、以及 `profiles/node_modules/` 共享依赖），并校正目标路径到 `homePath/profiles/`；用 `verbatimSymlinks: false` 让每次复制得到独立实目录而非符号链接。
3. **统一单一真相源**：把 `DEFAULT_PLUGINS` 收敛到 `config.ts` 导出（删除 `instances.ts` / `spawn.ts` 里的重复定义）；`TEMPLATE_DSH_HOME` 也经由 `config.ts` 读取（符合 standards §4.2）。
4. **保底降级路径**：模板缺失或复制失败时，保留 `installDefaultPlugins()` 作为降级（异步逐包 `dsh plugin --profile web add`），并用 `.plugins-installed` 标记门控，避免重复安装。保留 `spawn.ts` 启动兜底作为最后安全网。

> 注：`openspec/changes/dsh-plugin-install-fix/` 已先行定义了正确的插件安装命令（`dsh plugin --profile web add`），本提案沿用该命令，不改命令语法。

## Impact（影响范围）

- **受影响文件**：
  - `dsh-hub/Dockerfile`（新增模板构建阶段）
  - `dsh-hub/src/instances.ts`（修复 `copyPreinstalledPlugins()`，删除重复 `DEFAULT_PLUGINS`）
  - `dsh-hub/src/supervisor/spawn.ts`（删除重复 `DEFAULT_PLUGINS`，保留启动兜底）
  - `dsh-hub/src/config.ts`（新增 `DEFAULT_PLUGINS`、`templateDshHome`）
  - `dsh-hub/scripts/install-default-plugins.sh`（保持一致，可选）
- **影响功能**：会员购买/新建实例后的插件预置流程。
- **风险等级**：中（涉及实例创建与首次启动路径，需回归冒烟测试）。
- **向后兼容**：兼容。保留 `.plugins-installed` 标记检查逻辑；旧实例已安装的不受影响。
