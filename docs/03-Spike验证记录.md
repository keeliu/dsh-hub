# DSH Hub · Spike 验证记录（M0）

> 版本 v1（2026-08-22）。本文件是 S1–S5 的执行记录与结论，是后续里程碑（尤其 M3 网关、M5 加固）的决策依据。
> 全部 spike 在 `dsh-hub/spikes/`，零依赖，端口约定 3971/3972，永不触碰 3080/3081。

## 执行总览

| Spike | 目的 | 结果 | 关键结论 |
|---|---|---|---|
| S5 | 中文昵称→ext4 目录名 | ✅ 13/13 PASS | 净化规则成立；中文目录 roundtrip/改名/tar 备份全部兼容 |
| S2 | `--trusted-host` 匹配规则 | ✅ 完成（静态实证） | **精确全等**匹配（非后缀/通配），端口裸条目=任意端口 |
| S3 | systemd-run 资源限额 | ⚠️ 2 FAIL（环境性） | 非特权 transient scope 被 polkit 拒绝；M5 需 polkit 规则或特权路径 |
| S4 | npx 固定版本冷启动 | ⚠️ 1 FAIL（阈值启发） | **npm registry 可达**（纠正旧笔记）；冷启动 ≈3.2s，方案可行 |
| S1 | 反代 + 传输层 | ✅ 核心全过（见下） | **传输 = HTTP 单次 RPC + WebSocket 事件流**（M3 需要 WS 隧道）；另发现**特权方法回环钉死** |

**对计划的两处重大修正**（基于 S2/S1 代码实证）：
1. 计划 §3.5 的「WS 隧道必需」**成立**：长连接事件流 = **WebSocket** upgrade 到 `/api/events.mux` 与 `/api/events.host`（普通 GET 收到 426 Upgrade Required）。最早 S1 的 WS 探测失败只是探错了路径（试了 `/api`、`/ws`、`/hmr`）。M3 网关必须带 WS 隧道，单次 RPC 走普通 HTTP POST `/api/<method>`。
2. 调研笔记「外网不可达」**不准确**：npm registry 可达（HTTP 200，curl/node 均验证），GitHub 不可达。S4 不再是「预期 OFFLINE」。

---

## S5 · 昵称目录（ext4 实测）

运行：`node spikes/s5-nickname-dir.mjs`　结果：**13/13 PASS，exit 0**

- 中文昵称直接作目录名：mkdir/读写/stat 正常；`张三` = 6 字节（UTF-8 各 3 字节）。
- 净化规则断言全过：剔除斜杠（`/etc/passwd`→`etcpasswd`，无路径穿越）、前导 `.`（`..hidden`→`hidden`）、控制字符（`a\0b`→`ab`）、首尾空白；空结果回退 `user-00000001`；40 个「名」截断为 63 字节且不以替换符 `\uFFFD` 结尾（未劈开多字节字符）。
- 目录名冲突：`李四` → `李四-2` → `李四-3` 追加逻辑正确。
- 改名 `张三`→`张三·改名`：`rename()` 成功且内容保留；`tar -cf/-xf` 备份/还原中文目录名完整；`readdir` 可枚举无乱码。
- 目录布局 `用户目录/instances/<id>/{home,workspace,logs}` 可建。

**M2 设计结论**：§3.1 的净化规则照用（`src/index.ts` 已内嵌同款 `sanitizeNickname`）；中文昵称做**目录名**可行（不是 URL 标签——URL 标签仍需 ASCII slug，见 S2 结论）。

## S2 · `--trusted-host` 匹配规则（静态实证）

运行：`node spikes/s2-trusted-host.mjs`　结果：命中 8 处引用（`dsh-web-app/lib/{index,startup}.js`、`dsh-client-connection/lib/index.js`），阅读匹配函数源码后结论如下。

**最终规则**（`dsh-client-connection/lib/index.js` `isTrustedAuthority` / `isTrustedApiRequest`，已读源码）：

1. 匹配是**精确全等**，不是后缀/通配/endsWith：
   - 无端口条目（`example.com`）匹配该 hostname 的**任意端口**（`entryUrl.hostname === hostUrl.hostname`）；
   - 带端口条目（`example.com:8080`）匹配**精确 authority**（host:port）。
   - 两侧都经 WHATWG URL 归一化：大小写不敏感、忽略冗余 `:80`/`:443`。
2. 条目必须先通过 `assertTrustedAuthority` 的**规范形校验**（拒绝路径/用户、尾随空格、零填充端口等拼写噪音；IDN 必须用 punycode 形式）。
3. `/api` 围栏（`isTrustedApiRequest`）叠加两条规则：
   - Host 必须是 **loopback**（127/8、localhost、[::1]）**或**命中的 trusted entry；
   - 浏览器侧标记必须同源：`Sec-Fetch-Site: cross-site` 一律拒绝；带 `Origin` 时必须与 Host 同 host。

**M3 设计结论**：
- 每个实例应传**完整子域**作为 `--trusted-host`（如 `zs-i9f3k2a.dsh.example.com`），而不是泛域名——泛域名匹配不上精确全等（除非我们只用一个总域名然后靠网关改写 Host，不推荐）。
- 实例绑 127.0.0.1 时，回环规则天然放行本机；**网关反代必须原样转发 Host 头**，浏览器同源（Origin/Host 同值）才过围栏。
- 昵称含中文 ⇒ 子域名标签必须是 ASCII slug / punycode（`<用户slug>-<实例ID>`，slug 由昵称音译或随机生成）。**不能**直接拿中文昵称当 DNS 标签。
- 端口兜底模式（模式 C）：实例无 `--trusted-host` 也可工作，因为 127/8 回环即受信任；但公网浏览器 Host 是网关头时，需把网关公网域名加进 `--trusted-host`。

## S3 · systemd-run 资源限额（本机实测）

运行：`bash spikes/s3-systemd-run.sh`　结果：**2 FAIL（环境性）**，exit 1

- 首跑发现脚本自身一处错误：`--property=PidsLimit=` 是 cgroupfs 属性名，systemd-run 不识别（报 `Unknown assignment`）。已修为 `TasksMax=`（systemd-run 的合法属性，对应 cgroup v2 pids 控制器）。
- 修正后实测：
  1. systemd 运行中（`is-system-running=running`）。
  2. 非特权 `systemd-run --scope` **被 polkit 拒绝**：`requires interactive authentication`（当前 bash 非交互，无 polkit 规则放行）。
  3. `systemd-run --uid` 同样被拒（非特权无法降权/切 uid）。
  4. cgroup v2 用户子树（`/sys/fs/cgroup/user.slice/user-<uid>.slice/` 下建目录）**不可建**——本机未向用户 delegate cgroup。
  5. 附带事实：本执行环境设了 `no-new-privileges`，`sudo -n` 也被挡（容器/沙箱特征），`systemctl --user` 无用户总线。

**M5 设计结论**（重要，决定 M5 实现路径）：
- 默认（无 polkit 规则、非特权服务账号）下 **systemd-run 限额不可用**。M5 落地需三选一：
  a) 控制面以 root/systemd service 运行（由系统 unit 直接给实例进程组限额，或 root 下 `systemd-run`）；
  b) 为 DSH Hub 服务账号添加一条 polkit allow 规则（`org.freedesktop.systemd1.manage-units` / `start-transient-units`），仅限该账号；
  c) 降级方案：文档化「实例级限额仅建议值，靠每用户 max_running 配额 + 文档经验值控制」，不带 OS 强制。
- 严格模式（每用户独立 uid + setuid）同理需要 root/特权助手，本机非特权不可行——放到 M5 与（b）一起评估。
- 注：本机是沙箱/容器特征环境（no-new-privileges），真实部署（systemd 服务账户 + 自配 polkit）结论可能不同；部署手册须写清这一前提。

## S4 · npx 固定版本冷启动（网络实测）

运行：`node spikes/s4-npx-version.mjs`　结果：**1 FAIL（阈值启发）**，exit 1

- **纠正旧笔记**：`https://registry.npmjs.org` **可达**（S4 探测 PASS；curl `/-/ping` 亦 200，2.2s）。GitHub 仍不可达（TLS 中断）——「外网不可达」应改为「部分可达：npm registry 通、GitHub 不通」。
- 独立缓存冷启动：`npx --yes @deepseek-ai/dsh@0.1.1-rc.2 --version` = **3207ms**，输出 `0.1.1-rc.2` 可解析。
- 热启动（复用缓存）：2754ms。**阈值启发 FAIL** 的唯一原因：`warm/cold ratio=0.86` 未达 `<0.6`——绝对值差仅 ~0.45s，因为冷启动本身已很快（网络快 + 包小），**不构成方案否定**。
- 首次探测脚本有一处代码缺陷（调用了未定义的 `reportRegistry`），已修为 `record(...)`。

**M2 设计结论**：实例版本用 `npx --yes @deepseek-ai/dsh@<ver>` 固定版本**可行**，冷启动 ~3.2s 远低于 180s 启动预算；但**网络必须可达 npm registry**（本机满足；部署手册注明离线环境需预置 `npm_config_cache` 或直用全局 dsh）。

## S1 · 反向代理 + 传输层（实测）

运行：`node spikes/s1-reverse-proxy.mjs`　结果：**7/7 PASS，exit 0**（首版 2 FAIL 系探测路径错误，修正后全过）

- ✅ dsh web 以独立 DSH_HOME + 127.0.0.1:3971 就绪（TCP 探活成功）。
- ✅ 壳 HTML 经零依赖 Node 反代（HTTP + 管道转发）200（14556 字节）。
- ✅ `__DSH_BOOT__` 注入经代理保留。
- ✅ 绝对路径资源（/assets/*、favicon）经代理 4/4 200。
- ✅ 单次 RPC `POST /api/host.describe` 直连 200 且**经代理 200**（/api 围栏放行；信封 `{type:"server-response",rpcId,result:{ok:true,...}}` 完整）。
- ✅ **WS 事件流** `/api/events.mux` 与 `/api/events.host` 直连 **101**，**经代理 101**（零依赖 upgrade 隧道成功）。

**传输实证**（读 `dsh-client-connection/lib/{index,client}.js` 源码 + 426/101 实测，已定案）：
- 单次 RPC = HTTP `POST /api/<method>`，JSON 信封 `{type:"client-request",rpcId,method,payload}`；桥接 300MiB 上限、响应逐块流式；基址同源（`location.origin`）——**无硬编码回环 URL**（消除计划风险表第一条）。
- 长连接事件流 = **WebSocket**：服务端 `registerUpgrade` 挂 `/api/events.mux`、`/api/events.host`（`import WebSocket,{WebSocketServer} from "ws"`）；普通 GET 回 **426**（`connection: Upgrade, upgrade: websocket`）。浏览器侧由 shell 注入的 `__DSH_TRANSPORT__` 运行时 bundle 提供 WS 客户端（静态 dist 里无 `new WebSocket`，故前一轮静态扫描被误导）。
- WS 断线后浏览器侧自带指数退避重连（`backoffBaseMs=500, factor=2, max=10s`）——实例重启、网关重连后**浏览器免刷新自动恢复**（M3 验收项「断网重连自动恢复」机制现成）。
- ⚠️ **特权方法回环钉死**（M3 必须处理）：`PRIVILEGED_METHODS` = `settings.*`、`credentials.*`、`agentPreset.*`、`host.pickDirectory/openPath`、`llm.discoverModels` —— 即便配置了 `--trusted-host`，这些方法仍以**空信任表**过围栏（`isTrustedApiRequest(req, [])`），即只有 Host 为回环才放行。多用户网关下浏览器 Host 是公网域名 ⇒ 这些方法 403。

**M3 设计结论**（决定性）：
- 网关 = **HTTP 反代 + WS 隧道**（upgrade 原样转发，不能只做 HTTP；S1 的隧道实现可作为基线）。
- 单次 RPC 走普通 HTTP（无需 WS），事件流走 WS——两条都要通。
- Host 头原样转发 + `--trusted-host <完整子域>`（S2 精确全等）——**除特权方法外**的 /api 与两个 WS 端点都放行。
- 特权方法（settings/credentials/agentPreset/host path/llm.discoverModels）在域模式下 403：二选一——
  (a) 网关对 `/api` 与 WS 端点的转发做 **Host 重写回 127.0.0.1 + 剥离 Origin**（使回环围栏通过；注意这同时废掉 dsh 自身同源 CSRF 防线，靠 DSH Hub 管理面的会话+所有权+CSRF 顶上，需在文档明示）；
  (b) 不接受域内改凭据/设置：DSH Hub 用「管理员模板注入」供给凭据与设置（计划 §3.6 模式 2 成为默认），dsh UI 内设置页天然不可用（与 dsh「在真实鉴权层出现前配置面保持回环」的设计自洽）。M1 时先按 (b) 记，M3 验证 (a) 的可行性。
- 实例未运行时网关返回引导页（一键启动），管理面与实例流量同进程不同路由键——维持原计划。

## 对计划的更新（进入 M1 前）

1. **M3 网关**：确认 = **HTTP 反代 + WS 隧道**（S1 全过）；事件流端点 `/api/events.mux`、`/api/events.host` 必须升级转发；单次 RPC `/api/<method>` 普通 HTTP；Host 原样透传 + 每实例 `--trusted-host <完整子域>`。
2. **特权方法回环钉死**（新发现）：设置/凭据面在域模式下 403；M1 按「管理员模板注入为默认凭据供给」（计划 §3.6 模式 2），M3 再验证「Host 重写回环 + 剥 Origin」方案。
3. **版本供给**：`npx` 固定版本 OK（S4，冷启动 ~3.2s）；离线需预置 npm 缓存；部署手册注明「本机 npm registry 可达、GitHub 不可达」。
4. **M5 限额**：本机非特权 systemd-run 被 polkit 拒、cgroup 未 delegate、沙箱 no-new-privileges 连 sudo 都被挡——M5 实现项改为「root/systemd service 账户运行 or 为服务账号加 polkit 规则（给出样例），并保留每用户 max_running 配额为默认兜底」；严格模式同理需特权路径。
5. **路由模式**：子域模式（A）每实例各传完整子域；端口兜底模式（C）把网关公网域名加入 `--trusted-host`（端口裸条目任意端口匹配）。
6. **昵称→URL 标签**：目录名可用中文（S5），但子域标签必须 ASCII slug/punycode（S2）；M1/M2 需加 slug 生成规则。

## 遗留/开放项

- 特权方法在域模式下的两种处理（回环重写 vs 禁止域内配置）待 M3 实测定案。
- 昵称→ASCII slug 生成规则（音译/随机）待 M1 定。
- S4 的「热启动明显快于冷启动」阈值在本机快速网络下不满足（ratio 0.86，绝对值差 ~0.45s）——不阻塞，仅记录。