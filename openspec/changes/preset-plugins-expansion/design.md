# 设计：预置插件清单扩容

## 决策 1：清单只在 `presets.ts` 维护，Dockerfile 校验反向解析它

**问题**：Dockerfile 的构建期校验原先硬编码 `need=['dshmarket','dsh-better-sidebar','@xmanrui/dsh-im','dsh-cost-meter','@nagi-ovo/dsh-visualize']`。
这个数组是**另一份**清单副本：若只改 `presets.ts` 而不改它，校验仍然通过（拿旧名单去比对旧模板），缺陷不会暴露。

**选择**：`template-builder` 阶段 `COPY dsh-hub/src/presets.ts /tmp/presets.ts`，校验脚本解析出 `enabled:true` 的 spec：

```js
const need=[...src.matchAll(/\{\s*spec:\s*'([^']+)'\s*,\s*enabled:\s*(true|false)/g)]
  .filter(m=>m[2]==='true').map(m=>m[1]);
if (need.length===0 || miss.length || missBundle.length || badVer.length) process.exit(1);
```

**理由**：
- 加插件漏改安装链 → `dependencies` 缺该包 → **构建失败**（唯一真相源真正生效）；
- `need.length===0` 断言防止「正则失配导致空清单 → 校验永远通过」这类假绿；
- 仍保留 `COPY dsh-hub/src` 之外的显式 COPY（不整体复制应用目录，避免带入构建机 `node_modules`）；
- 正则依赖 `presets.ts` 的书写格式 `{ spec: '...', enabled: true, ... }`；`presets.ts` 结构变化（如改用 `spec:'x',enabled:!0`）会让解析退化为空清单 → 被 `need.length===0` 断言拦下，而不是静默放过。

**替代方案**：把清单抽成 JSON 供两侧共用（更彻底，但要改运行时读取逻辑与 `preset-plugin-management` 的 settings 结构）——本次不做，避免与运行期可配置清单的既有设计冲突。

## 决策 2：安装链保持「一个插件一行」

`dsh plugin add` 最终走 `pnpm add <name>`：CLI 只接受单包位置参数，多写会被忽略（实测 `add dshmarket dsh-cost-meter` 既不报错也不新增第二包）。
故 4 个新插件各写一行 `&&`（`RUN` 里 `\` 续行），保留「失败即定位到具体插件」的特性。

**替代方案**：改成 `for p in ...; do dsh plugin add $p; done` 循环——更短，但单行内失败定位差、且 `set -e` 语义在 Dockerfile `sh -c` 下不直观；不采用。

## 决策 3：新增插件一律 `allowBuild:false` / `workspace:false`

实测 4 个插件安装**没有**触发 pnpm 的 ignored-builds 警告（无原生模块需要编译），故不需要 `allowBuilds` 追加项；`workspace:false` 也与模板预装路径一致（`-w` 只有 `@xmanrui/dsh-im` 用）。

## 决策 4：插件版本不 pin，但 peer 必须覆盖基线

`dsh plugin add` 装的是 `latest`。基线升级到 `0.2.0-rc.2` 是这 4 个插件能被纳入的前提（它们的 peer 此前未覆盖 0.1.5-rc.2 的 `dsh-settings` 面）。
维护约束写入 `AGENTS.md`：**加插件前先看 `peerDependencies` 是否覆盖当前基线**，否则 dsh 会在安装期硬拒绝、构建失败。

## 决策 5：T3 回归样本从 `0.1.5-rc.2` 换成 `0.2.0-rc.1`（变量化）

`version-tree-regression.sh` 的 T3 需要一个「合法且 ≠ 内置版本」的样本，原用 `0.1.5-rc.2`（上一基线）。
2026-10 实测该组合已跑不通：T3 期间测试把预置清单设为**只有 `dshmarket`**，而 `dshmarket` 装的是 `latest`（1.66.17），
它声明 `@deepseek-ai/dsh-settings: ^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2 || ^0.2.0-rc.1`；
按 semver 预发布规则，`0.1.5-rc.2` 不被任何一段覆盖 → 插件树加载失败 → 实例虽 `running` 但端口不可访问（T3i 稳定 FAIL，21:16 与 22:5x 两次复现）。

**选择**：样本抽成变量 `T3_VERSION="${T3_VERSION:-0.2.0-rc.1}"`，默认 `0.2.0-rc.1`——与内置 `0.2.0-rc.2` 同线不同版本，仍走「跳过模板 + npx 装树」路径，且满足 `^0.2.0-rc.1`。

**为什么不删 T3i 断言**：断言本身是正确的（非内置版本实例必须能服务），失败暴露的是「老版本实例 + 上游 latest 插件」这一真实缺陷类别；换样本是让断言重新具备可满足的前提，而不是放宽断言。**产品含义**：pin 到旧版本的实例在插件树重装时会拉到与新版本不兼容的插件，生产上应尽量把实例版本对齐当前基线。
