# DSH 版本升级与鉴权修复手册

> **当前基线：`@deepseek-ai/dsh@0.2.0-rc.2`**（= npm `latest`，`dsh-hub/Dockerfile` 两处 pin）。
>
> 本手册记录两次基线升级的完整动作与后果：
> - **本次**：`0.1.5-rc.2` → **`0.2.0-rc.2`**；第 5 个预置插件由官方 `dsh-visualize` 换成
>   `@nagi-ovo/dsh-visualize`（原因见 §7.3：0.2.0-rc.2 会**硬拒绝**安装前者，构建期即失败）；
>   预置清单同时**扩容到 9 项**（新增 `@michengai/dsh-automation`、`@michengai/dsh-skills-manager`、
>   `dsh-context`、`@michengai/dsh-archive-manager`，均已实测 peer 覆盖 0.2.0-rc.2）。
> - 上次：`0.1.0-rc.7` → `0.1.5-rc.2`，并修复 0.1.5 起引入的 `dsh web` 浏览器鉴权
>   （工作区/智能体页面报 `dsh web authentication required; reopen the URL printed by dsh web.`）。
>
> 关联：提案 `openspec/changes/dsh-version-upgrade-0.2.0/`（本次）、`openspec/changes/dsh-version-upgrade/`（上次）；
> 提交 `0a2567d`（上次升级 + 补丁脚本健壮化）、`b99517c`（鉴权修复）。

---

## 0. 一句话流程

改 `Dockerfile` 两处 pin（**两处必须是同一版本**）→ 重建镜像 → **构建后校验** → 部署 →
**重启每个实例**（鉴权环境变量只在实例进程启动时注入）→ 若后台保存过预置清单，同步成默认的 9 项（见 §7.3）。

> ⚠️ 两个最容易漏的点：
> 1. 只 `git pull` 不生效——必须**重建镜像**。
> 2. 只重建 hub 不生效——必须**重启实例**（`ONEPANEL_DSH_AUTH_PROXY` 在实例进程启动时读取）。

---

## 1. 本次包含的关键变更

| 项 | 变化 |
|---|---|
| `dsh-hub/Dockerfile` | 两处 pin `@0.1.5-rc.2` → **`@0.2.0-rc.2`**（template-builder + 最终镜像） |
| `dsh-hub/Dockerfile` + `dsh-hub/src/presets.ts` | 第 5 个预置插件 `dsh-visualize` → `@nagi-ovo/dsh-visualize`（0.2.0-rc.2 拒绝安装官方包，见 §7.3）；清单由 5 项扩到 **9 项** |
| `dsh-hub/scripts/patch-dsh-client.sh` | 支持传入多个 node_modules 根目录（默认补内置安装），逐份定位并补丁；定位不到/锚点不存在时**显式报错退出**（不再静默跳过） |
| `dsh-hub/src/npx-dsh.ts`（新增）+ `spawn.ts` | 给 **npx 现下载的那份 dsh** 也打客户端补丁：非内置版本的实例用原始包启动会「状态 running、工作区 401」（见 §6/§7.4） |
| `dsh-hub/src/supervisor/spawn.ts` | 启动 `dsh web` 时注入 `ONEPANEL_DSH_AUTH_PROXY=1`（dsh 0.1.5 起浏览器鉴权的唯一旁路） |

---

## 2. 前置检查

```bash
# 目标版本
npm view @deepseek-ai/dsh version          # 期望 0.2.0-rc.2（= 当前 latest）

# 构建机需能出网（拉 npm 依赖 + pnpm 原生模块编译）
# 磁盘/内存充足（镜像多阶段构建 + node-gyp 编译）
```

---

## 3. 执行步骤

### 3.1 备份（不可跳过）

```bash
# 数据：DB + 用户/实例目录
cp -a /data/dsh-hub /data/dsh-hub.bak.$(date +%s)

# 旧镜像（回滚锚点）
docker tag dsh-hub:latest dsh-hub:pre-0.2.0
```

### 3.2 拉最新代码

```bash
cd <repo-root>            # 含 dsh-hub/ 与 scripts/ 的仓库根
git pull origin main
```

### 3.3 构建镜像（必须在仓库根上下文）

```bash
cd <repo-root>
bash scripts/build-image.sh
# 等价：docker build -f dsh-hub/Dockerfile -t dsh-hub:latest .
```

### 3.4 构建后校验（**任一不符就停，别部署**）

```bash
# a) 版本
docker run --rm --entrypoint dsh dsh-hub:latest --version          # 期望 0.2.0-rc.2

# b) 模板含全部预置插件
docker run --rm --entrypoint cat dsh-hub:latest \
  /opt/dsh-home-template/profiles/web/package.json                # dependencies 含 5 个插件

# b2) 模板核心 bundle 声明齐全、且与镜像里的 dsh 同版本
#     （dsh 的 base/web-app 装在 dsh 安装目录，不在 profile 的 node_modules 里，
#      所以查的是 dsh.profile.bundles + 全局安装里这两个包的版本）
docker run --rm --entrypoint node dsh-hub:latest -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('/opt/dsh-home-template/profiles/web/package.json','utf8'));const b=(p.dsh&&p.dsh.profile&&p.dsh.profile.bundles)||[];const core=['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app'];const root=require('node:child_process').execSync('npm root -g').toString().trim()+'/@deepseek-ai/dsh';const v=JSON.parse(fs.readFileSync(root+'/package.json','utf8')).version;const bad=core.filter(n=>!b.includes(n)||JSON.parse(fs.readFileSync(root+'/node_modules/'+n+'/package.json','utf8')).version!==v);console.log('bundles',b.length,'core 版本不一致',bad,'dsh',v);process.exit(bad.length?1:0);"
#   期望：exit 0；dsh 版本与模板 bundle 同版（镜像构建期已强制校验这一条，这里只是复核）

# c) 客户端补丁可定位且生效
docker run --rm --entrypoint sh dsh-hub:latest -c '/usr/local/bin/patch-dsh-client.sh'
#   期望：Successfully patched ...
#   若输出 skipping 或 ERROR → 停在 3.4，不要部署
```

### 3.5 部署

```bash
cd <repo-root>/dsh-hub
docker compose up --build -d
docker logs --tail=50 dsh-hub
curl -s http://127.0.0.1:3082/healthz     # 期望 {"ok":true,...}
```

### 3.6 重启实例（**鉴权修复生效的关键**）

`ONEPANEL_DSH_AUTH_PROXY` 只在实例进程 `spawn` 时注入，已在运行的 `dsh web` 进程不会自动获得。

- 方式一（推荐）：在管理后台/控制台对每个实例 **停止 → 启动**。
- 方式二：重建实例（删除后由会员激活/手工重建）。
- 方式三（运维）：确认 hub 已是新镜像后，逐个停启实例；不要只重启 hub。

---

## 4. 验证清单

```bash
# 1) 新建 1 个测试实例并启动
# 2) 实例插件齐全
cat <home_path>/profiles/web/package.json        # dependencies 含全部预置插件
# 3) 启动日志无模块/依赖解析报错
tail -50 <inst>/logs/web.out.log
# 4) 工作区/智能体页面正常
#    关键：不再出现 "dsh web authentication required"
# 5) hub 登录 / 导航 / 实例管理正常
# 6) 存量实例：确认新实例无误后，逐个删除重建（保留各自 workspace 数据）
```

**通过标准**：新实例能进工作区、插件在、无鉴权 401。

---

## 5. 回滚

```bash
# 镜像级（最快）
docker tag dsh-hub:pre-0.2.0 dsh-hub:latest
cd <repo-root>/dsh-hub && docker compose up -d --force-recreate

# 源码级
# 把 dsh-hub/Dockerfile 两处 pin 改成**上一基线** @deepseek-ai/dsh@0.1.5-rc.2 后重建
# （不要照抄更早的 0.1.0-rc.7——那是上上次的基线）

# 数据（仅异常时）
cp -a /data/dsh-hub.bak.<ts>/. /data/dsh-hub/
```

> 注意：仓库里的 `scripts/rollback.sh` 是**裸机（systemd/nohup）导向**，本 Docker 部署请用上面的镜像级回滚。

---

## 6. 常见坑

| 现象 | 原因 | 处理 |
|---|---|---|
| 构建报 `scripts/patch-dsh-client.sh not found` | 构建上下文用错（不是仓库根） | `cd <repo-root>` 后用 `-f dsh-hub/Dockerfile .` |
| 构建期插件装不上（`ERR_PNPM_IGNORED_BUILDS` / node-gyp） | pnpm 未批准原生构建 / 缺 python3、build-essential | 已在 Dockerfile 保留 `allowBuilds: node-pty: true` 与 `python3 build-essential` |
| 升级后工作区报 `dsh web authentication required` | ① dsh 0.1.5 起新增浏览器鉴权（0.2.0-rc.2 沿用）且实例未重启（没拿到 `ONEPANEL_DSH_AUTH_PROXY`）；② 实例固定了**非内置版本**，其 dsh 是 npx 现下载的原始包，镜像启动期的补丁覆盖不到 | ① 重启实例；② 已修复：启动前按版本给 npx 缓存副本补丁（`src/npx-dsh.ts`，见 §7.4），升级到本提交后的镜像并重启实例 |
| 设置页 403 | 客户端 loopback 补丁未生效 | 检查 `patch-dsh-client.sh` 输出非 `skipping`；构建后 3.4-c 已校验 |
| 改了代码线上没反应 | 只 pull 没重建镜像 / 容器落后 HEAD | 重建镜像 + `compose up -d --force-recreate` |
| 实例启动报 `plugin tree failed to load: @deepseek-ai/dsh-sandbox-local` | 插件树与运行版本不同源：树是镜像内置版本装的，进程却被指定版本用 `npx` 拉起 | 已修复（见 §7）；升级到本提交之后的镜像后，存量实例启动时会自动整棵重建插件树 |
| 指定版本的实例第一次启动很慢 / 报 `exited with null` | `npx --yes @deepseek-ai/dsh@<版本>` 首次要下载整个 dsh 包（数百 MB） | 等首次下载完成（超时上限 30 分钟）；完成后进 npm 缓存，重试很快 |

---

## 7. 指定「非镜像内置版本」的代价与自愈

实例的 dsh 版本来自 `harness_version`（网页/API 建实例时可填，留空取管理后台的
`default_harness_version`）。**插件树与运行进程必须来自同一个 dsh 版本**，代码里由
`config.ts::resolveDshCommand()` 保证：

| 目标版本 | 装插件用什么 | 启动用什么 | 用模板 `/opt/dsh-home-template`？ |
|---|---|---|---|
| 未指定，或 = 镜像内置版本 | 内置 `dsh`（`DSH_BIN`） | 内置 `dsh` | 是（快，秒级） |
| 其他版本 | `npx --yes @deepseek-ai/dsh@<版本>` | 同一个 `npx --yes @deepseek-ai/dsh@<版本>` | 否（模板是内置版本装的） |

三条要知道的后果：

1. **首次要联网下载**。`npx` 会把整个 dsh 包（实测 `0.1.5-rc.2` 含 510 个 tarball、数百 MB；
   基线 `0.2.0-rc.2` 的依赖树同量级——本机复现模板安装时 resolved 324 个包）
   拉进 npm 缓存；慢网络下 20–30 分钟，之后同一台机器的其它实例直接命中缓存。
   安装超时上限 30 分钟（`instances.ts::PLUGIN_INSTALL_NPX_TIMEOUT_MS`）。
2. **插件树会随版本重建**。`.plugins-installed` 记录装树时的版本；启动时若与目标版本不符，
   整棵 `profiles/` 被删除并按目标版本重装——这正是修 `dsh-sandbox-local` 启动失败的机制，
   存量坏实例无需手工处理。
3. **预置插件必须与基线版本兼容**：dsh 会按 `peerDependencies` 做**硬校验**并直接拒绝安装，
   构建期 `&&` 链因此中断、产不出镜像。实测原文：
   ```
   dsh: installation rejected: Plugin dsh-visualize@0.2.1 is incompatible with dsh 0.2.0-rc.2:
   peerDependencies {"@deepseek-ai/dsh-client-locale":"^0.1.0-rc.6", ...}
   ```
   所以默认清单第 5 项用 `@nagi-ovo/dsh-visualize`（声明 `^0.1.0-rc.6 || ^0.2.0-rc.1`）。
   扩容的 4 项（`@michengai/dsh-automation`、`@michengai/dsh-skills-manager`、`dsh-context`、
   `@michengai/dsh-archive-manager`）的 peer 也**已实测覆盖 0.2.0-rc.2**：前三者枚举到 `0.2.0-rc.2`，
   `dsh-context` 用 `>=0.1.7-rc.2` 范围。**加插件时务必先看 peer 范围**，否则构建期直接失败。
   失败的插件不会写进 `dsh.profile.bundles`；实例仍能启动，只是少了该插件；
   若清单里**所有**插件都失败，则不写 `.plugins-installed`，每次启动都会重试。

4. **非内置版本的实例要补客户端补丁**（2026-10 修复，实测 dsh@0.2.0-rc.1）。
   镜像启动时只对**内置** dsh（`/usr/local/lib/node_modules`）执行 `patch-dsh-client.sh`；
   非内置版本的 dsh 由 `npx` 现下载到 `~/.npm/_npx/<hash>/node_modules`，那是一份**原始包**，
   既没有 loopback 补丁也没有鉴权旁路 → 网关服务器端拉取实例首页拿到
   `401 dsh web authentication required; reopen the URL printed by dsh web.`，
   表现为「实例状态 running、工作区打不开」。修复：`spawn.ts` 在拉起进程前调
   `src/npx-dsh.ts::patchNpxDsh()`，按版本枚举 npx 缓存并复用同一个补丁脚本（幂等，
   补丁失败只 warn 不阻塞启动）。
   ⚠️ 残余边界：预置清单为**空**时不会先装插件，npx 包可能直到 spawn 才落地 → 那一次仍会 401，
   重启实例即可（第二次启动缓存已存在，会被补上）。

   ⚠️ **改默认清单对「存过 `settings.preset_plugins`」的部署无效**：后台一旦保存过预置清单，
   代码里的 `DEFAULT_PRESET_PLUGINS` 不再参与，实例装的是数据库里那份。升级后请到
   `/admin/plugins` 把清单同步成默认的 9 项（尤其第 5 项 `@nagi-ovo/dsh-visualize` 与新增 4 项），
   或清掉该设置让它回退默认。

> 建议：除非确实需要换版本，把 `default_harness_version` 与 `allowed_harness_versions`
> 都设成镜像内置版本（构建后在容器里 `dsh --version` 查看），这样走模板快路径，零下载。

---

## 8. 相关文件与提交

- 代码：`dsh-hub/Dockerfile`、`dsh-hub/scripts/patch-dsh-client.sh`、`dsh-hub/src/supervisor/spawn.ts`、`dsh-hub/src/config.ts`（`resolveDshCommand`）、`dsh-hub/src/instances.ts`（插件树标记）
- 回归：`dsh-hub/scripts/version-tree-regression.sh`、`dsh-hub/scripts/version-policy-regression.sh`
- 提案：`openspec/changes/dsh-version-upgrade/{proposal,design,tasks}.md`、`specs/acceptance.md`、`openspec/specs/instances.md`
- 提交：`0a2567d`（上次升级基线 + 补丁脚本健壮化）、`b99517c`（鉴权 401 修复）、`b89a575`（默认版本在网页路径不生效 + 白名单绕过）
- 本次（0.1.5-rc.2 → 0.2.0-rc.2）：`openspec/changes/dsh-version-upgrade-0.2.0/`、`dsh-hub/Dockerfile`、`dsh-hub/src/presets.ts`、`AGENTS.md`
