# 变更提案：会员实例预置插件自动装载

> 状态：**未实现成功，处于根因定位与方案修正阶段**。原实现（模板复制 + 降级安装 + 单一真相源）已落地，但在生产环境**实测未生效**，根因见「生产环境实测与根因」。本文档据此修正方案。

## Why（为什么做）

用户创建 DSH 实例后，默认需要**逐个安装预设插件**（`dsh plugin add`），每个插件可能来自 npm 或 GitHub，且部分含原生编译（如 `node-pty`），单实例耗时可达数分钟。用户从「创建实例」到「能正常使用带插件的工作空间」等待过长，体验差，也容易在启动阶段因插件未就绪而失败。

**目标**：在实例创建阶段就**自动、快速、可靠**地把一整套预设插件装载进该用户实例的独立 `DSH_HOME`，保证实例首次启动即可用。

## 现状（已落地但未生效）

现有实现已具备「模板复制 → 异步安装 → 启动兜底」三层机制，且已完成结构优化：
- `config.ts` 导出 `DEFAULT_PLUGINS`（5 个）与 `getTemplateDshHome()`（单一真相源）；
- `instances.ts::copyPreinstalledPlugins()` 复制**整棵 `profiles/`**（`verbatimSymlinks: true`）；
- `supervisor/spawn.ts::startInstance()` 保留启动兜底（受 `.plugins-installed` 门控）。

**但生产验证发现：预设插件并没有真正进入实例。** 实例虽能启动（`dsh web` 正常绑定端口），但 `home/profiles/web/package.json` 里**没有预设插件依赖**。根因见下节。

## 生产环境实测与根因（已验证）

在服务器实例 `i-c723a367` 上实测并与镜像对比，得到确定性结论：

### 根因 1：模板只装了 3/5 插件 —— 2 个 `github:` 源插件构建期失败且被静默吞掉
`/opt/dsh-home-template/profiles/web/package.json` 实测只含 3 个 npm 源插件：
```json
"dependencies": {
  "@xmanrui/dsh-im": "^4.0.1",
  "dsh-visualize": "^0.2.1",
  "dshmarket": "^1.41.0"
}
```
缺少 `github:omdsh-dev/DSH-better-sidebar#main` 与 `github:Han-1413141/dsh-cost-meter#main`。Dockerfile 里每条 `dsh plugin add` 都被 `|| echo WARN` 包裹，**失败被吞掉，模板以"不完整 3/5"继续构建**。

两个 `github:` 插件各自的死因（在镜像内手动复现，均 exit 1）：
- **dsh-better-sidebar**：`[ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED]` —— pnpm v11 默认**禁止 git-hosted 包执行 build/prepare 脚本**，必须把它加进 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds`。现有代码/模板**均未配置**。
- **dsh-cost-meter**：`[ERROR] Could not resolve main to a commit of https://github.com/Han-1413141/dsh-cost-meter.git.` —— **仓库或 `main` 分支解析不到**（仓库被删/改名/私有/无 main 分支，或构建期访问不到 github）。属外链资源损坏。

> 注：`which git` 实测为 `/usr/bin/git`，最终镜像**有 git**，故非 git 缺失。

### 根因 2：`copyPreinstalledPlugins` 不校验插件完整性，还无条件写"完成标记"
`copyPreinstalledPlugins` 只检查 `existsSync(profiles/web/node_modules)`（裸 profile 的 base bundle 安装会创建它），**不校验 `DEFAULT_PLUGINS` 是否都进了 `web/package.json`/`web/node_modules`**。于是它把**缺 2 个的模板**复制进实例、**无条件写 `.plugins-installed`**，返回 `true`。

### 根因 3：完成标记锁死了补救路径
因 `.plugins-installed` 已存在，`installDefaultPlugins()`（降级）与 `spawn.ts`（启动兜底）**都被永久跳过**。缺失的插件**永远不会被补装**。

### 根因 4：存量实例被"空模板 + 完成标记"固化
实例 `i-c723a367` 是在 `/opt/dsh-home-template` 仍为空/旧模板时创建的，复制进去的是 0 插件；后来镜像模板才变成 3/5，但**已创建实例不会重新复制**，且被完成标记锁死。新增实例可能拿到 3 个插件，但旧实例永远是空的。

## 方案决策（两根轴）

| 决策轴 | 结论 | 选择理由 |
|---|---|---|
| **模板如何生产** | 保留 **Docker 多阶段构建** | 全自动、可重复、版本随镜像绑定；但必须**校验模板完整性**，否则静默产出不完整模板 |
| **运行时如何装载** | **以运行时逐个真装为主，模板复制仅作已校验的加速** | 手动实测 `dsh plugin --profile web add <npm源>` 能成功（exit 0）；模板复制依赖"正确可靠的预烤模板",不可靠 |
| **插件来源** | **尽量全部使用 npm 源；github 源必须能可解析且有 allowBuilds** | 2 个 github 插件是本次失败的根源；npm 源已验证可靠 |

## What Changes（做什么，按根因修正）

**A. 系统性：让"模板复制"不再掩盖缺失**
1. `copyPreinstalledPlugins()` 复制前**校验 `web/package.json` 的 `dependencies` 覆盖全部 `DEFAULT_PLUGINS`**（或 `web/node_modules` 含对应包）；缺任何一个 → 返回 `false`，走运行时安装降级。
2. **只在全部插件真正到位后才写 `.plugins-installed`**；任一失败则不写，下次可重试。`installDefaultPlugins()`/`spawn.ts` 同样**失败不写标记**。

**B. 插件清单与可安装性**
3. 处理 `github:` 插件：为需要 build 脚本的包在 profile 的 `pnpm-workspace.yaml` 配置 `allowBuilds`（dsh-better-sidebar）；`dsh-cost-meter` 仓库/ref 已不可解析，**替换为可用的 npm 源或移除**。
4. 优先方案：**把 `DEFAULT_PLUGINS` 里的 2 个 `github:` 源替换成 npm 包或移除**，让全部插件走 npm registry（已实测可靠），从根上消除"模板装不全"。

**C. 存量实例**
5. 对被"空模板 + 完成标记"锁死的存量实例：**删除重建**，或手动逐个 `dsh plugin --profile web add` 补齐（并处理 `allowBuilds`）。

> 注：`openspec/changes/dsh-plugin-install-fix/` 已定义正确的插件安装命令（`dsh plugin --profile web add`），本提案沿用。

## Impact（影响范围）

- **受影响文件**：
  - `dsh-hub/Dockerfile`（模板构建阶段：加完整性校验/失败即失败；装 git；脚本构建期可跑）
  - `dsh-hub/src/instances.ts`（`copyPreinstalledPlugins` 加完整性校验；`installDefaultPlugins` 失败不写标记）
  - `dsh-hub/src/supervisor/spawn.ts`（启动兜底失败不写标记）
  - `dsh-hub/src/config.ts`（`DEFAULT_PLUGINS` 修正为可靠 npm 源）
  - `dsh-hub/scripts/install-default-plugins.sh`（与 `DEFAULT_PLUGINS` 一致，可选）
- **影响功能**：会员购买/新建实例后的插件预置流程。
- **风险等级**：中（涉及实例创建与首次启动路径，需回归冒烟测试）。
- **向后兼容**：兼容。保留 `.plugins-installed` 标记检查逻辑；但标记语义由"复制目录即算完成"改为"全部插件到位才算完成"，存量实例需重建。
