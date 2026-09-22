# 实施清单：升级 DSH 基线版本（方案 A）

> 目标版本 `@deepseek-ai/dsh@0.1.5-rc.2`。构建与真机验证**必须在服务器执行**（本沙箱无 dsh/Docker）。
> 阶段 2 的代码改动已落地；阶段 3 起需在服务器执行。

## 阶段 1：备份与准备（服务器执行）
- [ ] 1.1 备份数据：`cp -a /data/dsh-hub /data/dsh-hub.bak.$(date +%s)`
- [ ] 1.2 备份当前镜像：`docker tag dsh-hub:latest dsh-hub:pre-0.1.5`
- [ ] 1.3 核对目标版本：`npm view @deepseek-ai/dsh version`（期望 `0.1.5-rc.2`）

## 阶段 2：代码改动（已落地）
- [x] 2.1 `dsh-hub/Dockerfile`（template-builder）→ `@deepseek-ai/dsh@0.1.5-rc.2`
- [x] 2.2 `dsh-hub/Dockerfile`（最终镜像）→ `@deepseek-ai/dsh@0.1.5-rc.2`
- [x] 2.3 `dsh-hub/scripts/patch-dsh-client.sh`：改为 `require.resolve` 动态定位客户端 `client.js`；定位不到或补丁目标不存在时**显式报错退出**（不再静默跳过），并在 sed 后复核生效
- [x] 2.4 保留 Dockerfile 构建期模板插件校验（缺插件即失败）
- [x] 2.5 `dsh-hub/src/supervisor/spawn.ts`：启动 `dsh web` 时注入 `ONEPANEL_DSH_AUTH_PROXY=1`（适配 0.1.5+ 新增的浏览器鉴权，修复工作区页面 `dsh web authentication required`）

## 阶段 3：构建与构建后校验（服务器执行）
- [ ] 3.1 仓库根构建：`bash scripts/build-image.sh`
- [ ] 3.2 `docker run --rm --entrypoint dsh dsh-hub:latest --version` → `0.1.5-rc.2`
- [ ] 3.3 模板 `package.json` 的 `dependencies` 覆盖全部预置插件
- [ ] 3.4 `docker run --rm --entrypoint sh dsh-hub:latest -c '/usr/local/bin/patch-dsh-client.sh'` → 输出 `Successfully patched`（**非** `skipping`，也非 `ERROR`）
- [ ] 3.5 任一项不符 → 停止升级，回滚镜像

## 阶段 4：部署（服务器执行）
- [ ] 4.1 `cd dsh-hub && docker compose up --build -d`（或 `--force-recreate`）
- [ ] 4.2 `docker logs dsh-hub` 无启动错误；`/healthz` 正常

## 阶段 5：验证（服务器执行）
- [ ] 5.1 新建 1 个测试实例，启动 `dsh web`
- [ ] 5.2 实例 `home/profiles/web/package.json` 含全部预置插件
- [ ] 5.3 `logs/web.out.log` 无模块/依赖解析报错
- [ ] 5.4 该实例 workspace/设置页可正常打开（客户端补丁生效，无 403）
- [ ] 5.5 hub 登录/导航/实例管理正常
- [ ] 5.6 通过后再处置存量实例
- [ ] 5.7 智能体/工作区页面**不再**出现 `dsh web authentication required`（鉴权旁路已生效）

## 阶段 6：存量实例处置（服务器执行）
- [ ] 6.1 对存量实例：删除重建（或手动补装/验证）；保留其 workspace 数据
- [ ] 6.2 记录处置清单（哪些实例已重建）

## 阶段 7：文档与归档
- [ ] 7.1 更新 `AGENTS.md`：记录基线版本 → `0.1.5-rc.2`、补丁脚本动态化
- [ ] 7.2 补 Docker 版回滚步骤到运维文档（`rollback.sh` 为裸机导向）
- [ ] 7.3 提交（`chore(dsh): 升级基线 @deepseek-ai/dsh 至 0.1.5-rc.2`）
- [ ] 7.4 归档 `openspec/changes/dsh-version-upgrade/` → `archive/`，规范合并 `openspec/specs/`
