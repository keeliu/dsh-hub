# 实施清单：会员实例预置插件自动装载

> 规范先行：本清单是 `proposal.md` / `design.md` 的实施步骤，全部完成后归档到
> `openspec/changes/archive/`，并把涉及的功能规范合并入库。实现必须**先通过 `tsc -p . --noEmit`**。

## 阶段 1：模板生产（Docker 多阶段构建）

- [x] 1.1 在 `dsh-hub/Dockerfile` 增加 `template-builder` 阶段
  - 安装 `git`、`pnpm`、`@deepseek-ai/dsh`
  - `ENV DSH_HOME=/opt/dsh-home-template`
  - `mkdir -p $DSH_HOME/profiles/web && echo "ignore-scripts=false" > $DSH_HOME/.npmrc`
  - 逐个 `dsh plugin --profile web add [-w] <pkg>`（`|| echo WARN` 不阻断）
  - 清敏感信息：`rm -f .credentials.yaml && rm -rf sessions workspace`
- [x] 1.2 最终镜像阶段 `COPY --from=template-builder /opt/dsh-home-template /opt/dsh-home-template`
  - `RUN chmod -R 755 /opt/dsh-home-template`
  - `ENV TEMPLATE_DSH_HOME=/opt/dsh-home-template`
- [ ] 1.3 验证模板结构（`ls` 校验）：
  - `/opt/dsh-home-template/profiles/web/{package.json,cordis.patch.yml,pnpm-lock.yaml,pnpm-workspace.yaml,node_modules/}`
  - `/opt/dsh-home-template/profiles/node_modules/`（**共享依赖必须存在**）
  - `/opt/dsh-home-template/.npmrc`

## 阶段 2：代码 - 修复复制逻辑

- [x] 2.1 修改 `copyPreinstalledPlugins()`（`dsh-hub/src/instances.ts`）
  - 复制**整个 `profiles/` 目录**到 `homePath/profiles/`（校正目标路径，不再复制到 `homePath/node_modules`）
  - 使用 `cpSync(src, dst, { recursive: true, verbatimSymlinks: true })` 复制整棵 `profiles/`（保留软链，保证每实例自包含）
  - `profiles/web/node_modules/` 的 pnpm 相对软链保留（指向实例自身 `.pnpm` 仓库）；`profiles/node_modules/` 绝对软链由启动期 `healProfilesModuleFallback` 重指向
  - 复制 `.npmrc`；成功则写 `.plugins-installed`
  - 模板缺失/不完整或复制抛错 → 返回 `false`（触发降级）
  - > 注：design.md 原写 `verbatimSymlinks: false`「解引用」，实测 Node 24 的 `cpSync` 该选项并不解引用、反而会把相对软链改写成模板绝对路径；故改为 `verbatimSymlinks: true` 保留软链原样。
- [x] 2.2 `createInstance()` 保持现有调用顺序：先 `copyPreinstalledPlugins()`，返回 `false` 走 `installDefaultPlugins()` 降级
- [x] 2.3 保留 `installDefaultPlugins()`（`instances.ts`）作为模板缺失时的降级（异步逐包安装，受 marker 门控）
- [x] 2.4 保留 `spawn.ts` 启动兜底（受 marker 门控）

## 阶段 3：代码 - 统一单一真相源

- [x] 3.1 `dsh-hub/src/config.ts`
  - 新增导出 `DEFAULT_PLUGINS`（5 个默认插件）
  - 新增 `getTemplateDshHome()` 读取 `TEMPLATE_DSH_HOME`（默认 `/opt/dsh-home-template`）
- [x] 3.2 `instances.ts` 删除本地 `DEFAULT_PLUGINS` 定义，改为 `import { DEFAULT_PLUGINS } from './config.ts'`
- [x] 3.3 `spawn.ts` 删除本地 `DEFAULT_PLUGINS` 定义，改为 `import { DEFAULT_PLUGINS } from '../config.ts'`
- [x] 3.4 删除 `instances.ts` 中直接 `process.env.TEMPLATE_DSH_HOME` 读取，改用 `config`/`getTemplateDshHome()`
- [x] 3.5 可选：`scripts/install-default-plugins.sh` 的插件清单与 `DEFAULT_PLUGINS` 保持一致

## 阶段 4：验证

- [x] 4.1 `npx tsc -p . --noEmit` 通过，无类型错误
- [ ] 4.2 构建镜像并验证模板目录存在且完整（`profiles/web/*` + `profiles/node_modules/`）
- [ ] 4.3 创建测试用户并触发实例创建；校验实例 `home/profiles/web/` 完整、`home/profiles/node_modules/` 为实目录且内容与模板一致、`.plugins-installed` 已写
- [ ] 4.4 两个不同用户实例路径完全不同、相互隔离
- [ ] 4.5 模拟 `TEMPLATE_DSH_HOME` 不存在 → `copyPreinstalledPlugins()` 返回 `false`，走 `installDefaultPlugins()` 降级，实例创建不阻塞
- [ ] 4.6 验收 `instances.ts`：已无本地 `DEFAULT_PLUGINS`、无直接 `process.env.TEMPLATE_DSH_HOME`
- [ ] 4.7 验收 `spawn.ts`：已无本地 `DEFAULT_PLUGINS`，启动兜底仍在且受 marker 门控
- [ ] 4.8 运行既有冒烟测试：`bash dsh-hub/scripts/m1-smoke.sh`、`m2-smoke.sh`、`security-regression.sh`

## 阶段 6：生产修复（基于实测根因，A/B/C）

> 背景：1.1 / 2.1 等"已完成"仅在**结构层面**落地；生产实测发现**未生效**（模板只装 3/5、复制不校验、标记锁死）。以下为修正项，全部完成后重新验证。

### A. 复制不做假完成（系统性）
- [x] 6.1 `copyPreinstalledPlugins()`（`dsh-hub/src/instances.ts`）复制前**校验全部 `DEFAULT_PLUGINS` 已登记**到 `web/package.json` 依赖（或 `web/node_modules` 含对应包）；缺失任一 → 返回 `false`，走运行时真装
  - 新增 `templateHasAllPlugins(templateHome, plugins)` 辅助函数（解析 `web/package.json` 的 `dependencies`）
  - 不再以 `existsSync(profiles/web/node_modules)` 作为"完整"判据（改用 `templateHasAllPlugins`）
- [x] 6.2 **只在全部插件到位后写 `.plugins-installed`**；`installDefaultPlugins()`、`spawn.ts` 同步改为"成功才写标记、失败不写可重试"（`allOk` 门控）

### B. 插件清单与可安装性
- [x] 6.3 `dsh-hub/src/config.ts`：`DEFAULT_PLUGINS` 里 2 个 `github:` 源**替换为可用 npm 源**（`dsh-better-sidebar`、`dsh-cost-meter` 均已实测 npm 可解析）；全部插件走 npm registry
- [x] 6.4 不再保留 `github:` 源 → `allowBuilds` 场景不再触发（5 个 npm 包均无 `postinstall`，`prepare` 不随 registry 安装执行，pnpm git-deps 拦截已规避）
- [x] 6.5 `dsh-hub/Dockerfile`：`template-builder` 阶段**去掉 `|| echo WARN`**，任一插件安装失败即构建失败（`&&` 短路）；并新增构建期校验模板 `dependencies` 覆盖全部 `DEFAULT_PLUGINS`
  - `git` 已在构建镜像安装（`/usr/bin/git` 已实测存在）

### C. 存量实例
- [ ] 6.6 对被"空模板 + 完成标记"锁死的存量实例：**删除重建**，或手动 `dsh plugin --profile web add` 逐个补齐（`i-c723a367` 需处理）

## 阶段 5：文档与归档

- [x] 5.1 更新 `AGENTS.md`「当前进度」，记录会员实例预置模板完成
- [ ] 5.2 提交（`feat(member): 实例预置插件自动装载（模板复制 + 降级安装 + 单一真相源）`）
- [ ] 5.3 把本变更合并到 `openspec/changes/archive/`，功能规范补充到 `openspec/specs/`
