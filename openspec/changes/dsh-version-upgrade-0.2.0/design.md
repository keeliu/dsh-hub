# 设计：DSH 基线升级 0.1.5-rc.2 → 0.2.0-rc.2

## 决策 1：Dockerfile 两处 pin 必须同版本，且不允许用 `latest`

阶段 1（template-builder）用某个 dsh 版本把 5 个插件装进 `/opt/dsh-home-template/profiles/web`，
阶段 2（最终镜像）再用同一个版本运行 hub。若两处不一致：

- 模板里的 `dsh.profile.bundles` 声明的核心 bundle（`@deepseek-ai/dsh-base`、`-web-app`）由 dsh
  **从自己的安装目录**解析，版本必须与运行的 dsh 一致；
- 不一致时报 `plugin tree failed to load: @deepseek-ai/dsh-sandbox-local`，
  且因为是「非内置版本」路径，实例每次启动都要 npx 重装整棵树。

所以 pin 死 `0.2.0-rc.2`（当时 npm `latest` 与 `next` 同版本），**不用 `latest`**：
镜像构建不可复现、且「镜像内置版本」是实例版本比对的基准（`config.ts:90 getBuiltinDshVersion()`）。

## 决策 2：第 5 个插件换 `@nagi-ovo/dsh-visualize`（而不是放行/删除）

实测（`/data/dsh/home/.m2tmp/tpl020.log`，本机用 dsh 0.2.0-rc.2 复现 Dockerfile 序列）：

```
dsh: installation rejected: Plugin dsh-visualize@0.2.1 is incompatible with dsh 0.2.0-rc.2:
peerDependencies {"@deepseek-ai/dsh-client-locale":"^0.1.0-rc.6", ...}
dsh: nothing was installed.
```

三个候选方案：

| 方案 | 结论 |
| --- | --- |
| A. 换 `@nagi-ovo/dsh-visualize`（peer 声明 `^0.1.0-rc.6 \|\| ^0.2.0-rc.1`） | **采用**。实测可装；本机 `/data/dsh/profiles/web` 正是这个包（0.1.4），与 0.2.0-rc.2 同源可用 |
| B. 用 dsh 的 allow-version/忽略 peer 参数强行装 | 放弃：等于关掉 dsh 的兼容性护栏，后续版本错配会以更难查的运行时错误暴露 |
| C. 从默认清单删掉第 5 个插件 | 放弃：功能缺失，且 5 插件模板的构建期校验会失去一项覆盖 |

npm 事实（`npm view`）：`dsh-visualize` 只发布过 `0.1.0` 与 `0.2.1`，没有兼容 0.2.0-rc.2 的版本，
所以「留在官方包等新版本」不是当下可选项。

## 决策 3：构建期校验必须包含「核心 bundle 与 dsh 同版」

只校验「5 个插件在 dependencies 里」不够：插件装成功但核心 bundle 与 dsh 错配时，
镜像能建出来、hub 能起来，**只有在实例启动时才炸**（且报的是令人费解的 sandbox-local 错误）。
所以把 ③ 提为构建期硬失败：读 `npm root -g` 下 dsh 安装里
`node_modules/@deepseek-ai/dsh-base/package.json` 与 `-web-app` 的 `version`，必须 `=== dsh 自己的 version`。

## 决策 4：`version-tree-regression.sh` 的 T3 样本改为 `0.2.0-rc.1`（原定保留 `0.1.5-rc.2`）

T3 要验证的是「指定**非内置**版本 → 跳过模板 → npx 装树 → 同版本启动」，
样本必须与镜像内置版本（0.2.0-rc.2）**不同**。

原计划保留上一基线 `0.1.5-rc.2` 作样本，实跑证伪：`0.1.5-rc.2` 虽然仍属非内置版本，
但**插件生态的上游已经漂移** —— T3 的预置清单只装 `dshmarket`，而 `dshmarket` 的 latest
（实测 `1.66.17`）peer 声明为
`@deepseek-ai/dsh-settings: ^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2 || ^0.2.0-rc.1`，
按 semver 预发布规则**不覆盖 `0.1.5-rc.2`** ⇒ 插件树加载失败、实例 running 但端口不可访问，
T3i 报 `expected 0 got 1`（与本次升级改动无关的假失败；旧日志 `ver-tree2.log` 同样失败可证）。

因此样本改用 `0.2.0-rc.1`（同样非内置、且被 `dshmarket` peer 覆盖），并把版本抽成
`T3_VERSION="${T3_VERSION:-0.2.0-rc.1}"` 便于将来随基线/生态调整；脚本头部注明了这段原因。
**产品含义**：存量把 `harness_version` 钉在旧版本的实例，一旦插件树因版本不符而重建，
会拉到只支持新版本的插件 → 表现为实例 running 但页面打不开；这类实例应升级或改为跟随内置版本。

## 决策 5：`docs/04` 手册按「两次升级」重写，不抹掉史实

手册原先只讲 `0.1.0-rc.7 → 0.1.5-rc.2`。本次在头部引入「**当前基线**」概念，
把上次升级保留为历史条目，并新增本次条目；回滚节明确写「改回**上一基线** `0.1.5-rc.2`，
不要照抄更早的 `0.1.0-rc.7`」（原文正是不匹配当前 pin 的陈旧表述）。
历史提案 `openspec/changes/dsh-version-upgrade/` 不改写，本次另建
`openspec/changes/dsh-version-upgrade-0.2.0/`。

## 决策 6：非内置版本必须在启动前给 **npx 副本**打客户端补丁（新增 `src/npx-dsh.ts`）

T3i（`expected 0 got 1`）的第二个原因与版本无关：实例首页返回
`401 dsh web authentication required; reopen the URL printed by dsh web.` —— 实例进程确实是
running，网关服务器端拉不到已鉴权页面。根因：镜像 CMD 的 `patch-dsh-client.sh` 只补**内置**安装
`/usr/local/lib/node_modules`，而指定版本时 dsh 由 `npx` 现下载到
`~/.npm/_npx/<hash>/node_modules`（`dsh-client-connection` 在那里是**扁平**提升的），是**原始包**：
`client.js` 无 loopback 补丁、`index.js` 无 `ONEPANEL_DSH_AUTH_PROXY` 旁路。

选择「启动前按版本补 npx 缓存副本」，而不是：
- 让实例跳过鉴权（改 dsh 行为，不归我们）；或
- 在 hub 里复制一份补丁逻辑（两处实现必然漂移）。

实现：`patch-dsh-client.sh` 改为接受**任意多个 node_modules 根目录**参数（默认仍补内置安装，
保持镜像 CMD 与人工排查用法不变，幂等、找不到目标即 `exit 1`）；
`src/npx-dsh.ts` 按目标版本枚举 `~/.npm/_npx/*/node_modules` 并复用该脚本；
`DshCommand` 增加 `kind: 'builtin' | 'npx'`，`spawnAndProbe` 仅对 `npx` 调 `patchNpxDsh()`。
补丁失败**只 warn 不阻塞启动**（宁可 401 也不能让实例起不来）。
残余边界（已写进 `docs/04` §7.4）：预置清单为**空**时不会先装插件、npx 包可能到 spawn 才落地，
那一次仍会 401，重启实例即补上。

## 未验证项 / 待办

- 本机**无 docker**，镜像构建与构建期校验未在真实 `docker build` 中执行过；
  已用本机 dsh 0.2.0-rc.2 复现同一插件安装序列 + 对模板 `package.json` 直接跑校验逻辑作为替代证据。
- 生产 `default_harness_version` 当前值未知（截图推断是 `0.2.0-rc.2`），部署时需实机确认。
