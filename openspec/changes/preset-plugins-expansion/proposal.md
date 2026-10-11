# 预置插件清单扩容（4 个新面板插件）

- **状态**：提案（Propose）→ 已实施（见 `tasks.md`）
- **关联**：`openspec/changes/dsh-version-upgrade-0.2.0/`（基线升级使这些插件的 peer 首次被覆盖）、`openspec/changes/member-instance-template/`、`openspec/changes/preset-plugin-management/`
- **真相源代码**：`dsh-hub/src/presets.ts::DEFAULT_PRESET_PLUGINS`、`dsh-hub/Dockerfile`

## Why

用户要求把 4 个插件纳入**基线版本**（新实例默认预装）：

| 插件 | 提供的能力 |
|---|---|
| `@michengai/dsh-automation` | 面板内定时/计划任务（`automation` 系列工具） |
| `@michengai/dsh-skills-manager` | 面板内 Skills 管理 |
| `dsh-context` | 上下文使用情况洞察 |
| `@michengai/dsh-archive-manager` | 面板内会话归档管理 |

此前默认清单只有 5 项（dshmarket / dsh-better-sidebar / @xmanrui/dsh-im / dsh-cost-meter / @nagi-ovo/dsh-visualize）。
另外本次一并消除一个**维护性缺陷**：默认清单在 4 处重复维护（`presets.ts`、Dockerfile 安装链、Dockerfile 校验里的硬编码 `need=[...]`、`install-default-plugins.sh`），
加插件时漏改任一处都不会立刻暴露——Dockerfile 校验里的名单是**硬编码**的，`presets.ts` 改了它也不报错。

## What Changes

1. `dsh-hub/src/presets.ts`：`DEFAULT_PRESET_PLUGINS` 从 5 项扩到 **9 项**（order 5–8，`allowBuild:false`、`workspace:false`，均已实测无需 pnpm 批准 build）。
2. `dsh-hub/Dockerfile`：
   - `template-builder` 阶段新增 4 条 `dsh plugin --profile web add ...`（保持「一个插件一行」，失败可定位到具体插件）；
   - **构建期校验 ① 改为以 `presets.ts` 为单一真相源**：新增 `COPY dsh-hub/src/presets.ts /tmp/presets.ts`，校验脚本用正则解析出 `enabled: true` 的 spec 列表，再与模板 `dependencies` 比对。删除了原先硬编码的 `need=[...]` 数组 → 加了插件却漏改安装链会**构建失败**。
3. `dsh-hub/scripts/install-default-plugins.sh`：同步 9 项（本地开发/降级真装路径）。
4. 文档：`AGENTS.md`（默认清单 9 项 + 选型约束 + 单一真相源说明）、`docs/04-DSH版本升级与鉴权修复手册.md`（§1/§7.3 提到扩容与 peer 约束）。
5. 回归修正：`dsh-hub/scripts/version-tree-regression.sh` 的 T3「非内置版本」样本改为变量 `T3_VERSION`（默认 `0.2.0-rc.1`），理由见 `design.md` 决策 5。

## 兼容性证据（2026-10 实测）

本机 `node --expose-internals <dsh>/lib/bin.js plugin --profile web add <pkg>`（`DSH_HOME` 指向 scratch home，dsh `0.2.0-rc.2`）：

| 插件 | 版本 | peerDependencies 覆盖情况 | 结果 |
|---|---|---|---|
| `@michengai/dsh-automation` | 0.1.61 | 枚举到 `0.2.0-rc.2` | exit=0（仅 peer WARN） |
| `@michengai/dsh-skills-manager` | 1.1.15 | 枚举到 `0.2.0-rc.2`（另需 react/react-dom ^18.2.0，dsh 自身提供） | exit=0 |
| `dsh-context` | 0.68.1 | `@deepseek-ai/dsh-session >=0.1.7-rc.2`、`dsh-client-ui-primitives >=0.1.7-rc.2` | exit=0 |
| `@michengai/dsh-archive-manager` | 1.0.16 | 枚举到 `0.2.0-rc.2` | exit=0 |

安装后该 profile 的 `dependencies` 9 项、`dsh.profile.bundles` **11 项**（2 核心 bundle + 9 插件）；
用改后的构建期校验脚本对该模板实跑：`[template] OK: 预置插件 9 个全部在模板 + 核心 bundle 声明 + 版本一致 (dsh 0.2.0-rc.2)`；
负例（从模板 `dependencies` 删掉 `@michengai/dsh-archive-manager`）→ 退出码 1，并打印 `模板缺 [ '@michengai/dsh-archive-manager' ]`。

## Impact

- **新建实例**：默认多装 4 个插件。首次装树时间与磁盘占用上升（每个插件数十 MB 量级；`TMPDIR`/数据盘需有余量）。
- **存量实例**：不回溯（与 `preset-plugin-management` 既有边界一致）；后台 `settings.preset_plugins` 若保存过旧清单，需在 `/admin/plugins` 同步，否则回退默认也**不会**自动重装。
- **镜像构建**：安装链变长（9 次 `dsh plugin add`），构建时间增加；任一插件装不上即构建失败（原有语义）。
- **风险**：插件版本未 pin（装 `latest`），上游某次发布会改变 peer 面；缓解手段为构建期校验 + 失败即构建失败，以及 T3 fixture 的教训（见 `design.md` 决策 5）。
