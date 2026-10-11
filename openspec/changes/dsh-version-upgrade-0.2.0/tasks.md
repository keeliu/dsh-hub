# 任务清单：DSH 基线升级 0.1.5-rc.2 → 0.2.0-rc.2

## 1. 版本基线

- [x] `dsh-hub/Dockerfile:18`（template-builder）pin → `@deepseek-ai/dsh@0.2.0-rc.2`
- [x] `dsh-hub/Dockerfile:61`（最终镜像）pin → `@deepseek-ai/dsh@0.2.0-rc.2`
- [x] 两处 pin 加注释说明「必须同版本」与错配后果

## 2. 预置插件换源

- [x] `dsh-hub/src/presets.ts` 默认清单第 5 项 → `@nagi-ovo/dsh-visualize`
- [x] `dsh-hub/Dockerfile` 安装链第 5 条 → `@nagi-ovo/dsh-visualize`
- [x] `dsh-hub/Dockerfile` 构建期校验数组末项同步
- [x] `dsh-hub/scripts/install-default-plugins.sh` 同步（未被 TS 引用，保持一致性）
- [x] 本机复现安装序列验证：dshmarket / dsh-better-sidebar / @xmanrui/dsh-im / dsh-cost-meter /
      `@nagi-ovo/dsh-visualize` 全部装上；官方 `dsh-visualize` 被 dsh 硬拒绝

## 3. 构建期完整性校验

- [x] ①模板 dependencies 覆盖 5 插件
- [x] ②`dsh.profile.bundles` 含 `@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app`
- [x] ③核心 bundle 在全局 dsh 安装内且版本 === dsh 版本
- [x] 用真实模板（`/data/dsh/home/.m2tmp/tpl020-home/profiles/web/package.json`）核对：bundles 7 项、
      dependencies 5 插件 → 校验逻辑成立

## 4. 文档 / 规范同步

- [x] `AGENTS.md`：默认清单第 5 项 + 「当前基线」说明
- [x] `docs/04-DSH版本升级与鉴权修复手册.md`：头部两次升级说明、§0 流程、§1 表格、期望版本、
      `pre-0.2.0` tag、§6 现象表、§7.1 实测数字、§7.3 重写、§8 相关文件
- [x] `openspec/specs/instances.md`：示例版本号上移一档
- [x] UI/注释文案：`views/admin.ts` placeholder、`config.ts`、`supervisor/spawn.ts`、
      `scripts/patch-dsh-client.sh`（后两者按史实表述「0.1.5 起引入，基线沿用」）
- [x] 本提案四件套（`proposal.md` / `design.md` / `tasks.md` / `specs/acceptance.md`）

## 5. 测试脚本

- [x] `dsh-hub/scripts/version-policy-regression.sh`：样本 → `0.2.1-alpha.2`（11 处）
- [x] `dsh-hub/scripts/version-tree-regression.sh`：T3 样本抽成 `T3_VERSION="${T3_VERSION:-0.2.0-rc.1}"`
      （原定保留 `0.1.5-rc.2`，因 `dshmarket` 上游 peer 已不覆盖它而改，见 design 决策 4）
- [x] `dsh-hub/scripts/patch-dsh-client.sh`：支持传多个 node_modules 根目录（默认补内置安装）
- [x] 回归：m1-smoke 24/24、m2-smoke 29/29、security-regression 38/38、version-policy 33/33、
      page-admin 14/14、ui-audit（基线计数）、format/migrate-v8/schema-v8 selftest
- [ ] version-tree 复跑（T3i 在 npx 副本补丁后应转 PASS）

### 5.1 非内置版本的鉴权缺陷（T3i 的第二因）

- [x] 复现定位：`/data/dsh/home/.m2tmp/t3i-repro.sh` → 实例 running 但首页
      `401 dsh web authentication required`（npx 副本是原始包）
- [x] 新增 `dsh-hub/src/npx-dsh.ts`（`npmCacheDir` / `npxDshRoots` / `patchNpxDsh`）
- [x] `dsh-hub/src/config.ts`：`DshCommand` 增加 `kind: 'builtin' | 'npx'`
- [x] `dsh-hub/src/supervisor/spawn.ts`：`if (cmd.kind === 'npx') patchNpxDsh(cmd.version);`
- [x] `docs/04` §1 表格 / §6 现象表 / §7.4 / §8 同步

## 6. 部署（需人工执行，非本仓库代码）

- [ ] 生产 `git pull` + `docker compose up --build -d`
- [ ] 后台 `default_harness_version` / `allowed_harness_versions` 对齐 `0.2.0-rc.2`
- [ ] 存量实例：改版本或置空后重启（否则仍走 npx 装树路径）
- [ ] 若存过 `settings.preset_plugins`：到 `/admin/plugins` 改第 5 项
- [ ] 保留回滚镜像 tag `dsh-hub:pre-0.2.0`
