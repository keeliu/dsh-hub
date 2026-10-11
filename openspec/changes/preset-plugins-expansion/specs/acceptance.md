# 验收规范：预置插件清单扩容

## 场景 1：默认清单包含 9 个插件

- **GIVEN** 仓库处于本变更之后的状态
- **WHEN** 读取 `dsh-hub/src/presets.ts` 的 `DEFAULT_PRESET_PLUGINS`
- **THEN** 恰好 9 项且全部 `enabled: true`：`dshmarket`、`dsh-better-sidebar`、`@xmanrui/dsh-im`、`dsh-cost-meter`、`@nagi-ovo/dsh-visualize`、`@michengai/dsh-automation`、`@michengai/dsh-skills-manager`、`dsh-context`、`@michengai/dsh-archive-manager`
- **AND** 新增 4 项均为 `allowBuild:false`、`workspace:false`

## 场景 2：镜像构建期校验以 presets.ts 为唯一真相源（正例）

- **GIVEN** 模板 `profiles/web/package.json` 的 `dependencies` 含全部 9 个插件，且 `dsh.profile.bundles` 声明了两个核心 bundle
- **WHEN** 执行 Dockerfile 里的校验脚本（或等价的本地跑法）
- **THEN** 退出码 0，输出 `[template] OK: 预置插件 9 个全部在模板 + 核心 bundle 声明 + 版本一致 (dsh <版本>)`

## 场景 3：漏装任一插件 → 构建失败（负例，防假绿）

- **GIVEN** 从模板 `dependencies` 中删除 `@michengai/dsh-archive-manager`
- **WHEN** 执行同一校验脚本
- **THEN** 退出码非 0
- **AND** 错误信息明确指出 `模板缺 [ '@michengai/dsh-archive-manager' ]`
- **AND** 若 `presets.ts` 解析结果为空（正则失配/文件结构变化），同样退出非 0（`need.length===0` 断言）

## 场景 4：安装链与清单一致

- **GIVEN** `dsh-hub/Dockerfile` 的 `template-builder` 安装链
- **WHEN** 数其中 `dsh plugin --profile web add` 的次数
- **THEN** 每条都对应 `presets.ts` 里一个 `enabled` 插件，共 9 条（`@xmanrui/dsh-im` 带 `-w`）
- **AND** `dsh-hub/scripts/install-default-plugins.sh` 的清单与之一致

## 场景 5：新增插件的 peer 覆盖基线

- **GIVEN** 基线 dsh `0.2.0-rc.2`
- **WHEN** 在 scratch `DSH_HOME` 上逐个 `dsh plugin --profile web add <4 个新插件>`
- **THEN** 每次都 exit=0，且不出现 `installation rejected: Plugin ... is incompatible with dsh <版本>`
- **AND** 无 `ERR_PNPM_IGNORED_BUILDS`（无需追加 `allowBuilds`）

## 场景 6：回归样本可用（T3）

- **GIVEN** `version-tree-regression.sh` 的 `T3_VERSION` 默认为 `0.2.0-rc.1`（≠ 内置 `0.2.0-rc.2`）
- **WHEN** 运行该回归
- **THEN** T3a–T3i 全 PASS：跳过模板、用 `npx --yes @deepseek-ai/dsh@0.2.0-rc.1` 装树、标记记录该版本、进程命令行同版本、端口可访问
- **AND** 该样本可用环境变量覆盖（`T3_VERSION=... bash scripts/version-tree-regression.sh`）
