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

## 上游行为变化：dsh web 浏览器鉴权（0.1.5-rc.2）与对策

**现象**：升级后进入智能体/工作区页面直接显示 `dsh web authentication required; reopen the URL printed by dsh web.`

**根因**：`@deepseek-ai/dsh@0.1.5-rc.2` 的 `dsh-client-connection`（`lib/index.js`）给 web index/API 增加了**浏览器鉴权**：
- `dsh web` 生成 `launchToken`，打印的 URL 带 `?token=<launchToken>`；
- GET `/` 校验 token 后下发 **authority（Host）绑定的签名 cookie**，后续请求靠该 cookie 通过 `isAuthenticated`；
- 无 cookie / 不匹配 → 401 `dsh web authentication required…`；
- 全代码**唯一旁路**：`isAuthenticated` 开头 `if (process.env.ONEPANEL_DSH_AUTH_PROXY === '1') return true;`

hub 网关是**服务器端** `fetch('http://127.0.0.1:<port>/')` 拉取实例首页（不带浏览器 cookie），后续代理也不注入该 cookie → 实例返回 401，被原样透传为页面内容。

**对策**：hub 在 `spawn.ts` 启动 `dsh web` 时注入 **`ONEPANEL_DSH_AUTH_PROXY=1`**。
- 实例仅监听 `127.0.0.1`，外部不可直连；
- 进入实例的**所有**路径（`/workspace`、`/i/<slug>-<id>`、静态/插件 fallback、WS）都由 hub 网关先做**会话鉴权 + 所有权 + 会员**校验；
- 因此让 dsh 信任"前置代理已鉴权"与 hub 的信任模型一致，无需搬运 token/cookie。

**备选（未采用）**：解析 `web.out.log` 打印的 `?token=` 并回注 cookie —— 复杂、易碎、依赖日志格式。

## 上游行为变化：dsh web 启动协议（bundle 图 JSON）与 Workspace HTML 重写

**现象**：升级后实例前台报 `Failed to load plugins` / `client-modules: HTML did not preload @deepseek-ai/dsh-client-modules/client.js`。

**根因**：0.1.5 的 index 用 `<script src="/plugins/??…">` / `<link rel="preload" as="script" href="/plugins/??…">` 加载客户端 module bundle，并把 bundle URL 放进内联 `globalThis["__DSH_BOOT__"] = { entries:[{ url:"/plugins/??…" }] }`。hub 的 `rewriteHtmlPaths` 只改写**标签属性**（→ `/workspace/plugins/…`），**没有改写内联 JSON 里的同一 URL** → 预加载 URL 与 boot 图 URL 不一致 → 客户端判定"未预加载"。

**对策**：在 `gateway.ts::rewriteHtmlPaths` 末尾追加对**带引号的绝对 bundle 路径**的统一前缀（覆盖内联 JSON），且幂等、不会重复加前缀：
```ts
result = result.replace(/(["'])\/(plugins|assets)\//g, `$1${prefix}/$2/`);
```
（相对路径 `./assets/…` 不动，经 `/assets/` 静态 fallback 代理。）

## 决策记录

| 编号 | 决策 | 结论 | 理由 |
|---|---|---|---|
| U1 | 升级路径 | **方案 A：升级全局基线** | 补丁天然生效；方案 B 的 npx 副本不被 patch → 设置页 403 |
| U2 | 版本策略 | 钉 `0.1.5-rc.2`（不用 latest） | 与仓库"pin 死版本"约定 + `version.ts` 显式 semver 一致 |
| U3 | 补丁脚本 | 动态定位 + 失败显式告警 | 消除跨版本静默失效（设置页 403 根因） |
| U4 | 插件失败 | 构建期校验缺插件即**失败** | 不发布"实例无预置插件"的镜像 |
| U5 | 存量实例 | 先试点新实例，再删重建 | 存量 profile 与新基线依赖闭包可能不匹配 |
| U6 | 回滚 | 镜像 tag 备份（`pre-0.1.5`） | 现有 `rollback.sh` 是裸机导向，Docker 需镜像级回滚 |
| U7 | dsh web 鉴权 | `spawn.ts` 注入 `ONEPANEL_DSH_AUTH_PROXY=1` | 0.1.5+ 新增浏览器鉴权；hub 已是鉴权代理，实例仅 127.0.0.1 |
| U8 | Workspace HTML 重写 | `rewriteHtmlPaths` 追加对带引号绝对 bundle 路径的统一前缀 | 0.1.5 启动协议把 bundle URL 放进 `__DSH_BOOT__` JSON；只改标签会导致 URL 不一致 |

## 回滚方案
- **镜像级**：`docker tag dsh-hub:pre-0.1.5 dsh-hub:latest && docker compose up -d --force-recreate`。
- **源码级**：Dockerfile 两处 pin 改回 `0.1.0-rc.7` 后重建。
- 数据：一般无需回滚（升级不改 schema）；如异常，用第 1 步的 `/data/dsh-hub.bak.*` 恢复。
