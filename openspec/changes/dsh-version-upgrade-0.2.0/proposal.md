# 变更提案：DSH 基线升级 0.1.5-rc.2 → 0.2.0-rc.2

## Why（为什么做）

**触发问题**：线上实例 `i-cf6acb09` 状态 `failed`，版本 `0.2.0-rc.2`，而镜像内置版本是 `0.1.5-rc.2`。
两者不等 ⇒ 启动走**非内置版本路径**：`node <npx> --yes @deepseek-ai/dsh@0.2.0-rc.2`，
配合 `profiles/` 里由 **0.1.5-rc.2** 装出来的插件树 ⇒ `plugin tree failed to load`，
实例起不来（这正是 `dsh-hub/src/supervisor/spawn.ts:88-90` 那条「标记版本不一致就整棵重建」要解决的问题，
但重建需要 npx 下载数百 MB，超时窗口内表现为「启动失败」）。

根因是**版本基线与运维侧默认值脱节**：

- 镜像基线（Dockerfile 两处 pin）决定能「零下载走模板快路径」的那个版本；
- `settings.default_harness_version` / `allowed_harness_versions` 决定新建实例默认拿什么版本；
- `instances.harness_version` 在创建后不再重算（`instances.ts:109 resolveHarnessVersion`）。

三者必须收敛到同一版本，否则每次启动都在装树。

## What Changes（做什么）

1. **基线升级**：`dsh-hub/Dockerfile` 两处 pin `@deepseek-ai/dsh@0.1.5-rc.2` → **`@0.2.0-rc.2`**
   （= npm `latest` / `next`；两处**必须同版本**，见 design「决策 1」）。
2. **第 5 个预置插件换源**：`dsh-visualize` → **`@nagi-ovo/dsh-visualize`**
   （`dsh-hub/src/presets.ts::DEFAULT_PRESET_PLUGINS`、Dockerfile 安装链与构建期校验、AGENTS.md）。
   原因：官方 `dsh-visualize@0.2.1` 的 `peerDependencies` 只写到 `^0.1.0-rc.6`，
   dsh **0.2.0-rc.2 会硬拒绝安装**（`installation rejected: ... incompatible with dsh 0.2.0-rc.2`），
   整条 `&&` 链失败 ⇒ 产不出镜像；`@nagi-ovo/dsh-visualize` 声明 `^0.1.0-rc.6 || ^0.2.0-rc.1`，实测可装。
3. **构建期三项完整性校验**（Dockerfile 单行 `node -e`，任一不满足即构建失败）：
   ①模板 `dependencies` 覆盖 5 个默认插件；②模板 `dsh.profile.bundles` 声明核心 bundle
   `@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app`；③这两个 bundle 在全局 dsh 安装里真实存在
   且**版本与 dsh 包版本一致**。③ 是防「模板与运行时 dsh 版本错配」的关键不变量。
4. **文档/规范/测试同步**（同一主题的所有落点）：
   - `AGENTS.md`：默认清单第 5 项、当前基线说明；
   - `docs/04-DSH版本升级与鉴权修复手册.md`：基线、`pre-0.2.0` 镜像 tag、期望版本、
     §7.3 改写为「dsh 硬拒绝不兼容插件」+「改默认清单对存过 `settings.preset_plugins` 的部署无效」；
   - `openspec/specs/instances.md`：示例版本号上移一档（`0.1.5-rc.2`→`0.2.0-rc.2`、`0.2.0-rc.2`→`0.2.1-alpha.2`）；
   - `dsh-hub/scripts/version-policy-regression.sh`：样本 `0.1.5-rc.2` → `0.2.1-alpha.2`（11 处）；
   - `dsh-hub/scripts/version-tree-regression.sh`：**故意保留** `0.1.5-rc.2` 作 T3「非内置版本」样本
     （改成 0.2.0-rc.2 会退化成内置路径，测试失去意义），只补注释说明；
   - UI 文案/注释：`views/admin.ts` 的版本 placeholder、`config.ts`/`spawn.ts` 的自愈示例。

## 部署影响（必须同步的操作）

1. 生产 **`git pull` + 重建镜像**（模板阶段要联网装 0.2.0-rc.2 与 5 插件，构建时间明显变长）。
2. 后台设置里把 **`default_harness_version`**（与 `allowed_harness_versions`）对齐到 `0.2.0-rc.2`，
   否则新建实例仍会指定非内置版本 → 每次启动都要 npx 装树。
3. 存量实例：`harness_version` 已固化在 DB，**不会**随镜像升级自动改变。
   要让它们走快路径，需把实例版本改成 `0.2.0-rc.2`（或清空 = 用镜像内置）后重启。
4. 若后台**保存过** `settings.preset_plugins`，代码里的默认清单不生效，
   需到 `/admin/plugins` 把第 5 项改成 `@nagi-ovo/dsh-visualize`（或清掉该设置回退默认）。

## Impact / 风险

- **风险等级**：中高（升级基线 = 数据面整体换版本）。
- **回滚**：镜像 tag `dsh-hub:pre-0.2.0` 保留上一版；把两处 pin 改回 `@0.1.5-rc.2` 重建即可回退
  （手册 §5）。注意更早的 `0.1.0-rc.7` 是**上上次**基线，不要照抄。
- **不受影响**：鉴权补丁（`ONEPANEL_DSH_AUTH_PROXY`，0.1.5 起引入，0.2.0-rc.2 沿用）、
  版本白名单/RCE 防护逻辑、实例状态机。
