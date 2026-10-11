# 实施清单：预置插件清单扩容

## 1. 代码 / 配置
- [x] `dsh-hub/src/presets.ts`：`DEFAULT_PRESET_PLUGINS` 增加 4 项（order 5–8：`@michengai/dsh-automation`、`@michengai/dsh-skills-manager`、`dsh-context`、`@michengai/dsh-archive-manager`），并注释说明 peer 覆盖基线与无需 build 批准
- [x] `dsh-hub/Dockerfile`：安装链补 4 条 `dsh plugin --profile web add`
- [x] `dsh-hub/Dockerfile`：`COPY dsh-hub/src/presets.ts /tmp/presets.ts`；校验 ① 改为解析 `presets.ts` 的 `enabled` 清单（删掉硬编码 `need=[...]`），并加 `need.length===0` 假绿断言
- [x] `dsh-hub/Dockerfile`：更新构建期注释（9 个插件、第 5 项 swap 理由、第 6~9 项 peer 证据、单一真相源说明）
- [x] `dsh-hub/scripts/install-default-plugins.sh`：清单同步 9 项

## 2. 回归修正
- [x] `dsh-hub/scripts/version-tree-regression.sh`：T3 样本抽成 `T3_VERSION`（默认 `0.2.0-rc.1`），T3a/T3c/T3e/T3h 改用变量；文件头写明「为什么不再用 0.1.5-rc.2」

## 3. 文档 / 规范
- [x] `AGENTS.md`：默认清单 9 项 + 选型约束（peer 必须覆盖基线）+ 单一真相源说明；多阶段构建段改为「解析 `presets.ts`」；措辞去掉「5 个插件」残留
- [x] `docs/04-DSH版本升级与鉴权修复手册.md`：§1 适用说明、§1 变更表、§2 操作步骤、§7.3 peer 约束补充扩容 4 项
- [x] 本提案四件套（`proposal.md` / `design.md` / `tasks.md` / `specs/acceptance.md`）

## 4. 验证
- [x] 4 个插件在 dsh `0.2.0-rc.2` 上真装（scratch `DSH_HOME`，逐个 exit=0，无 build 批准需求）
- [x] 新校验脚本对真模板实跑通过：`[template] OK: 预置插件 9 个全部在模板 + 核心 bundle 声明 + 版本一致 (dsh 0.2.0-rc.2)`
- [x] 负例（模板删掉 `@michengai/dsh-archive-manager`）→ 退出码 1 且打印缺失包名
- [x] `npx tsc -p . --noEmit` 通过
- [x] `m1-smoke.sh` 24/24、`security-regression.sh` 38/38（本次改动前一轮已复跑）
- [ ] `m2-smoke.sh`（29 项）在 9 插件清单下复跑
- [ ] `version-tree-regression.sh` 在 `T3_VERSION=0.2.0-rc.1` 下复跑（预期 T3i 转 PASS）
- [ ] `page-admin-regression.sh` 14/14、`ui-audit.mjs --baseline`（本次已过，改动不含视图）

## 5. 部署（人工，生产）
- [ ] `git pull` → 重建镜像（`bash scripts/build-image.sh`）→ 重启容器
- [ ] `/admin/plugins` 检查清单是否与默认 9 项一致（保存过旧清单的需手动同步）
- [ ] 抽查一个**新建**实例：`profiles/web/package.json` 的 `dependencies` 含 9 个插件，实例面板能看到定时任务/Skills/上下文/归档入口
