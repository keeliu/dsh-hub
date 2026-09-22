# 变更提案：升级 DSH 基线版本（dsh-version-upgrade）

## Why（为什么做）

实例默认使用的 DSH（`@deepseek-ai/dsh`）版本由镜像内**全局安装**的基线决定，当前钉死在 `0.1.0-rc.7`（`dsh-hub/Dockerfile` 两处）。npm 上最新为 **`0.1.5-rc.2`**。用户希望"把 DSH 升级到最新版"。

**本轮决策：采用方案 A（升级基线）**——把镜像内全局 dsh 升到最新，重建镜像后**新建实例默认使用新版**。

> 为什么不用方案 B（实例级 `npx @latest` 试水）：`patch-dsh-client.sh` 只在容器启动时 patch **全局安装**那份客户端；方案 B 走 `npx` 会落在 **npx 缓存**里、**不会被 patch** → 该实例 workspace/设置页会 403。故方案 A 更彻底、补丁天然生效。

## 现状（版本相关事实）

| 位置 | 现状 |
|---|---|
| `dsh-hub/Dockerfile:15`（template-builder） | `npm i -g pnpm @deepseek-ai/dsh@0.1.0-rc.7` |
| `dsh-hub/Dockerfile:47`（最终镜像） | `npm i -g @deepseek-ai/dsh@0.1.0-rc.7` |
| `dsh-hub/scripts/patch-dsh-client.sh:8` | 硬编码嵌套路径 `.../@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-connection/lib/client.js`（**跨版本易变**） |
| `dsh-hub/src/config.ts::getDshBin()` | `DSH_BIN` 或猜 `.../@deepseek-ai/dsh/lib/bin.js` |
| `src/supervisor/spawn.ts:118-121` | 实例有 `harness_version` → `npx --yes @deepseek-ai/dsh@<ver>`；否则用全局基线 |
| 运行环境 | Docker Compose 部署；数据 `/data/dsh-hub:/data`；`DSH_BIN=/usr/local/bin/dsh` |

- 新版 dsh 的 `bin` 仍为 `lib/bin.js`（已核对 npm 元数据），`getDshBin()` 猜测路径不受影响。

## What Changes（做什么）

1. **升级 Dockerfile 基线 pin**：`0.1.0-rc.7` → `0.1.5-rc.2`（**两处**：template-builder + 最终镜像）；继续**钉死具体 semver**，不用 `latest`。
2. **客户端补丁路径健壮化**：`patch-dsh-client.sh` 不再硬编码嵌套路径——改为用 `node -e` + `require.resolve` 动态定位 `@deepseek-ai/dsh-client-connection/lib/client.js`；定位不到时**打印醒目错误**（不再静默 `skipping patch`），避免"补丁静默失效 → 设置页 403"。
3. **构建期校验保留/加强**：`template-builder` 后继续校验模板 `dependencies` 覆盖全部预置插件（现有 `presets.ts` 清单），**缺任一即构建失败**（不发布"实例缺插件"的镜像）。
4. **部署与回滚流程**：升级前给当前镜像打 tag 备份（如 `dsh-hub:pre-0.1.5`）；回滚 = 切回该 tag。
5. **存量实例处置**：基线升级后旧实例 `profiles/` 与新 dsh 依赖闭包可能不匹配 → **先建 1 个新实例验证，再对存量实例删除重建**。

## Impact（影响范围）

- **受影响文件**：
  - `dsh-hub/Dockerfile`（两处版本 pin）
  - `dsh-hub/scripts/patch-dsh-client.sh`（动态定位客户端文件 + 失败告警）
- **受影响功能**：所有**新建实例**默认 DSH 版本；存量实例需重建；模板插件需在构建期重装。
- **风险等级**：中高（涉及镜像数据面版本；插件 CLI/profile 布局可能变化）。
- **向后兼容**：新建实例用新版；存量实例保持旧基线（但可能因软链/依赖闭包不一致而不稳，建议重建）。实例级 `harness_version` 机制不变。
- **测试限制**：本环境无 `dsh`/Docker，**构建与真机验证必须在服务器执行**。
