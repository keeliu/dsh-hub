# 技术方案：升级 DSH 基线版本（方案 A）

## 目标版本
- 目标：`@deepseek-ai/dsh@0.1.5-rc.2`（npm `latest`，发布时核对一次 `npm view @deepseek-ai/dsh version`）。
- 策略：**钉死具体 semver**（不用 `latest`），与仓库既有约定及 `version.ts`（仅显式 semver）一致。

## 变更点

### 1. Dockerfile：两处 pin
```dockerfile
# 阶段 1：template-builder（约 15 行）
RUN npm i -g pnpm @deepseek-ai/dsh@0.1.5-rc.2

# 阶段 2：最终镜像（约 47 行）
RUN npm i -g @deepseek-ai/dsh@0.1.5-rc.2
```
> 两处必须**同时**改：template-builder 用新版装插件并产出模板；最终镜像用新版跑实例。若只改一处，会出现"模板基线 ≠ 运行基线"。

### 2. `patch-dsh-client.sh`：动态定位（消除跨版本脆性）
现状硬编码：
```sh
DSH_CLIENT_JS="/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-connection/lib/client.js"
```
目标改为动态解析（示例）：
```sh
DSH_CLIENT_JS="$(node -e "try{console.log(require.resolve('@deepseek-ai/dsh-client-connection/lib/client.js',{paths:['/usr/local/lib/node_modules/@deepseek-ai/dsh']}))}catch(e){process.exit(1)}" 2>/dev/null || true)"
if [ -z "$DSH_CLIENT_JS" ] || [ ! -f "$DSH_CLIENT_JS" ]; then
  echo "[patch] FATAL: DSH client.js 未找到（版本布局可能变化），请检查补丁路径" >&2
  exit 1   # 不再静默跳过，避免设置页 403
fi
```
> 若新版本仍是同一嵌套布局，动态定位也能命中；若布局变化（提升/去重），动态定位仍能自适应。**关键是把"静默跳过"改为"显式失败"。**

### 3. 构建期模板校验（保留）
现有 Dockerfile 中 `node -e ... miss.length ? exit(1)` 校验模板 `package.json` 覆盖全部预置插件 —— **保留**。这是"拒绝发布缺插件镜像"的闸门。

## 升级操作流程（在服务器执行）

> ⚠️ 构建上下文必须是**仓库根**；本环境不能构建/运行，以下命令由你在服务器执行。

1. **备份数据**：`cp -a /data/dsh-hub /data/dsh-hub.bak.$(date +%s)`（DB + 用户/实例目录）。
2. **备份当前镜像**：`docker tag dsh-hub:latest dsh-hub:pre-0.1.5`（回滚锚点）。
3. **改 pin**：Dockerfile 两处 → `0.1.5-rc.2`。
4. **改 patch 脚本**：`patch-dsh-client.sh` 动态定位 + 失败告警（见上）。
5. **重建镜像**（仓库根）：
   ```bash
   cd <repo-root>
   bash scripts/build-image.sh            # 或 docker build -f dsh-hub/Dockerfile -t dsh-hub:latest .
   ```
6. **构建后校验**（关键）：
   ```bash
   # a) 版本
   docker run --rm --entrypoint dsh dsh-hub:latest --version          # 期望 0.1.5-rc.2
   # b) 模板含全部预置插件
   docker run --rm --entrypoint cat dsh-hub:latest /opt/dsh-home-template/profiles/web/package.json
   # c) 客户端补丁路径可定位（不再 skipped）
   docker run --rm --entrypoint sh dsh-hub:latest -c '/usr/local/bin/patch-dsh-client.sh'
   ```
   任一项不符 → **停止升级、回滚镜像**。
7. **部署**：
   ```bash
   cd <repo-root>/dsh-hub && docker compose up --build -d
   # 或：docker compose up -d --force-recreate
   ```
8. **新建 1 个实例验证**（见验收规范）。
9. **存量实例处置**：确认新实例没问题后，对存量实例**删除重建**（数据在各自 workspace，注意先备份/迁移）。旧实例暂不动。

## 风险与对策

| 风险 | 对策 |
|---|---|
| 客户端补丁路径随版本变化 → 设置页 403 | 动态定位 + 失败告警；构建后第 6.c 步验证 |
| 新版 `dsh plugin` / profile 布局变化 → 模板装插件失败 | 构建期模板校验缺插件即失败（闸门）；不发布不完整镜像 |
| 存量实例软链指向旧闭包 → 不稳定 | 新实例验证通过后删除重建 |
| 数据丢失 | 升级前 `cp -a /data/dsh-hub` 备份 |
| 回滚慢 | 升级前 tag `dsh-hub:pre-0.1.5`；回滚 = `docker tag` 切回 + `compose up -d` |
| 网络/registry 不可达导致构建失败 | 构建期即暴露；确认构建机出网 |

## 决策记录

| 编号 | 决策 | 结论 | 理由 |
|---|---|---|---|
| U1 | 升级路径 | **方案 A：升级全局基线** | 补丁天然生效；方案 B 的 npx 副本不被 patch → 设置页 403 |
| U2 | 版本策略 | 钉 `0.1.5-rc.2`（不用 latest） | 与仓库"pin 死版本"约定 + `version.ts` 显式 semver 一致 |
| U3 | 补丁脚本 | 动态定位 + 失败显式告警 | 消除跨版本静默失效（设置页 403 根因） |
| U4 | 插件失败 | 构建期校验缺插件即**失败** | 不发布"实例无预置插件"的镜像 |
| U5 | 存量实例 | 先试点新实例，再删重建 | 存量 profile 与新基线依赖闭包可能不匹配 |
| U6 | 回滚 | 镜像 tag 备份（`pre-0.1.5`） | 现有 `rollback.sh` 是裸机导向，Docker 需镜像级回滚 |

## 回滚方案
- **镜像级**：`docker tag dsh-hub:pre-0.1.5 dsh-hub:latest && docker compose up -d --force-recreate`。
- **源码级**：Dockerfile 两处 pin 改回 `0.1.0-rc.7` 后重建。
- 数据：一般无需回滚（升级不改 schema）；如异常，用第 1 步的 `/data/dsh-hub.bak.*` 恢复。
