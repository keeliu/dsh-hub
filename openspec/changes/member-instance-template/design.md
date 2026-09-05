# 技术方案：会员实例预置插件自动装载

> 状态：**结构已实现，但实测未生效**。本方案在「背景/目标架构」基础上，补充**生产实测根因**，并把决策与实现细节修正到"可靠生效"状态。核心变化：**模板复制必须先校验完整性，失败/不完整必须回退到运行时逐个真装；`github:` 源插件必须可解析且允许 build 脚本；完成标记语义改为"全部插件到位"**。

## 背景：DSH 插件是如何加载的

- 每个实例有**独立的 `DSH_HOME`**。`dsh web` 默认从 `$DSH_HOME/profiles/web` 启动 web profile。
- `dsh plugin --profile web add <pkg>` 把剩余参数**转发给 `$DSH_HOME/profiles/web` 下的 pnpm**：写入该 profile 的 `package.json` 依赖、链接 `node_modules`。插件落盘位置是 `$DSH_HOME/profiles/web/node_modules/`，并登记进 `dsh.profile.bundles`。
- `dsh plugin add` 能**自动初始化 profile**（手动实测：`dsh: initialized profile web`），无需先 `dsh web` boot。
- **`healProfilesModuleFallback` 机制**：dsh 把依赖闭包镜像到 `$DSH_HOME/profiles/node_modules`（符号链接），让 profile 插件与 dsh 共享同一 Cordis 实例。模板/实例目录**必须包含** `profiles/node_modules/`。

可用实例的 profile 结构：
```
<dir>/home/
├── profiles/
│   ├── web/
│   │   ├── package.json           # 依赖清单（含预设插件）
│   │   ├── cordis.patch.yml       # 插件/组件配置
│   │   ├── pnpm-lock.yaml
│   │   ├── pnpm-workspace.yaml    # 含 allowBuilds（git 源需要）
│   │   └── node_modules/
│   └── node_modules/              # healProfilesModuleFallback 共享依赖
└── .npmrc
```

## 生产实测根因（已验证，本次修正的依据）

在实例 `i-c723a367` 服务器实测 + 镜像内手动复现，得到确定结论：

1. **模板只装了 3/5 插件**。`/opt/dsh-home-template/profiles/web/package.json` 只有 `dshmarket`/`@xmanrui/dsh-im`/`dsh-visualize` 三个 npm 源插件；缺 2 个 `github:` 源。
2. **2 个 `github:` 插件必挂**（手动 `dsh plugin --profile web add` 均 exit 1）：
   - `dsh-better-sidebar` → `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`：pnpm v11 禁止 git 包执行 build/prepare 脚本，需在 profile 的 `pnpm-workspace.yaml` 加 `allowBuilds`；**现有实现未配置**。
   - `dsh-cost-meter` → `Could not resolve main to a commit`：仓库/`main` ref 不可解析（外链损坏）。
3. **复制不校验完整性且无条件写标记**：`copyPreinstalledPlugins` 只看 `profiles/web/node_modules` 存在，**不校验 `DEFAULT_PLUGINS` 是否尽数登记**；于是把缺 2 个的模板当"已安装"。
4. **标记锁死补救**：`.plugins-installed` 存在 → 降级安装与启动兜底都被跳过 → 缺失插件永不补装。
5. **存量实例固化**：`i-c723a367` 在模板为空/旧时创建，复制为 0 插件；后续模板虽变完整，旧实例不重新复制。

> 手动验证：`dsh plugin --profile web add dshmarket`（npm 源）在镜像内 **exit 0**，证明运行时逐个装是可靠的；`which git` → `/usr/bin/git`，最终镜像有 git。

## 目标架构

```
┌────────────────────────────────────────────┐
│ Docker 构建阶段 1：template-builder         │
│  装 git + pnpm + dsh；DSH_HOME=/opt/...     │
│  逐个 dsh plugin --profile web add <pkg>    │
│  ② 校验：全部 DEFAULT_PLUGINS 都进了        │
│     package.json/node_modules；否则让构建失败│
│  清敏感信息                                  │
│  输出：完整且自校验的模板                    │
└────────────────────────────────────────────┘
        │ COPY --from
        ▼
┌────────────────────────────────────────────┐
│ 最终镜像 /opt/dsh-home-template（只读）     │
└────────────────────────────────────────────┘
        │ 运行时 copyPreinstalledPlugins()
        ▼
┌────────────────────────────────────────────┐
│ 用户实例 home                               │
│  ① 校验模板完整性：default 插件是否齐全      │
│  齐全 → 复制 profiles/ + .npmrc，写标记       │
│  缺失/失败 → 返回 false                     │
└────────────────────────────────────────────┘
        │ 若 false → installDefaultPlugins()
        ▼
  逐包 dsh plugin --profile web add <pkg>
  （npm 源可靠；github 源需 allowBuilds 且可解析）
  ① 全部成功 → 写 .plugins-installed（才写）
    任一失败 → 不写、可重试
```

## 决策记录（Decision Log，含修正）

| 编号 | 决策 | 结论 | 理由 |
|---|---|---|---|
| D1 | 模板生产方式 | Docker 多阶段构建 | 全自动、可重复、版本随镜像绑定 |
| D2 | 运行时装载架构 | **运行时逐个真装为主，模板复制仅作已校验的加速** | 手动实测 npm 源 `dsh plugin add` 可靠；模板复制依赖"完整可靠的预烤模板"，不可靠 |
| D3 | 复制范围 | 整棵 `profiles/`（`web/*` + `profiles/node_modules/`） | 避免遗漏 profile 配置与共享依赖 |
| D4 | 符号链接 | `cpSync(..., { recursive: true, verbatimSymlinks: true })` | 保留 pnpm 相对软链，`profiles/node_modules` 绝对软链由启动期 heal 重指向（实测 `false` 会把相对软链改写坏） |
| D5 | 单一真相源 | `DEFAULT_PLUGINS` + `getTemplateDshHome()` 收敛到 `config.ts` | 消除重复定义；符合 standards §4.2 |
| D6 | 降级与安全网 | 保留 `installDefaultPlugins()` + `spawn.ts` 兜底 | 模板不可用/竞态时保证插件最终装入 |
| **D7** | **模板完整性校验（新）** | `copyPreinstalledPlugins` 复制前校验 `web/package.json` 的 `dependencies` **覆盖全部 `DEFAULT_PLUGINS`**（或 `web/node_modules` 含对应包）；缺失 → 返回 `false` | 否则会把"不完整模板"当已安装，是本次未生效的直接原因 |
| **D8** | **完成标记语义（新）** | **只在全部插件到位后写 `.plugins-installed`**；任一失败不写、可重试（`installDefaultPlugins`/`spawn.ts` 同理） | 原实现无条件写标记，锁死了补救路径 |
| **D9** | **插件来源（新）** | **优先全部 npm 源**；`github:` 源必须 `pnpm-workspace.yaml` 配 `allowBuilds` 且 ref 可解析 | 2 个 `github:` 插件是"模板装不全"的根源 |
| **D10** | **存量实例（新）** | 被"空模板+完成标记"锁死的实例需删除重建/手动补装 | 旧实例不会重新复制，被标记固化 |

## 关键改动 1：`copyPreinstalledPlugins()`（加完整性校验 + 标记诚实）

```ts
/** 校验模板是否包含全部默认插件（看 web/package.json deps 或 web/node_modules 里有包）。 */
function templateHasAllPlugins(templateHome: string, plugins: readonly string[]): boolean {
  const pkgPath = join(templateHome, 'profiles', 'web', 'package.json');
  if (!existsSync(pkgPath)) return false;
  let pkg: { dependencies?: Record<string, unknown> };
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { return false; }
  return plugins.every(p => {          // 用包名/仓库 spec 判断依赖是否登记
    const name = toPackageName(p);      // 把 github:... 等 spec 归一化成包名
    return !!pkg.dependencies?.[name];
  });
}

function copyPreinstalledPlugins(homePath: string, instanceId: string): boolean {
  const templateHome = config.templateDshHome;
  if (!existsSync(templateHome)) {
    console.log(`[instances] Template directory not found: ${templateHome}, falling back to install`);
    return false;
  }
  // ① 先校验模板完整性：默认插件必须齐全，否则视为不完整 → 降级真装
  if (!templateHasAllPlugins(templateHome, DEFAULT_PLUGINS)) {
    console.log(`[instances] Template profile incomplete (missing plugins), falling back to install`);
    return false;
  }
  try {
    const srcProfiles = join(templateHome, 'profiles');
    const dstProfiles = join(homePath, 'profiles');
    mkdirSync(dstProfiles, { recursive: true });
    cpSync(srcProfiles, dstProfiles, { recursive: true, verbatimSymlinks: true });
    const srcNpmrc = join(templateHome, '.npmrc');
    if (existsSync(srcNpmrc)) cpSync(srcNpmrc, join(homePath, '.npmrc'));
    // ② 复制成功且模板已校验齐全 → 才写标记
    writeFileSync(join(homePath, '.plugins-installed'), new Date().toISOString());
    return true;
  } catch (err) {
    console.error(`[instances] Failed to copy pre-installed profile:`, err);
    return false;                      // 失败 → 降级
  }
}
```

要点：
- **先校验、后复制、再标记**。校验从"目录/node_modules 存在"升级为"全部 `DEFAULT_PLUGINS` 已登记"。
- 只有模板**确证完整**才写 `.plugins-installed`；否则走降级真装，不锁死补救。

## 关键改动 2：`installDefaultPlugins()` / `spawn.ts`（失败不写标记，可重试）

- 逐包 `dsh plugin --profile web add [-w] <pkg>`（npm 源可靠；`github:` 源需 `allowBuilds` + ref 可解析）。
- **收集结果：全部成功才 `writeFileSync(.plugins-installed)`；有任一失败则不写并记录，下次可重试。**
- 不做"失败也写标记"的固化行为；不阻塞实例启动（失败仅告警）。

## 关键改动 3：插件来源与 `allowBuilds`

- **优先方案**：把 `DEFAULT_PLUGINS` 里 2 个 `github:` 源（`DSH-better-sidebar`、`dsh-cost-meter`）替换为可用的 npm 包，或移除；让全部插件走 npm registry（已实测可靠）。
- 若必须保留 `github:` 源：在 profile 的 `pnpm-workspace.yaml` 里为需要 build 脚本的包配置 `allowBuilds`（如 `dsh-better-sidebar`），否则 pnpm 会拦截其 prepare 脚本；并确认其 ref 可解析（`dsh-cost-meter` 当前不可解析，需换源/移除）。
- `config.ts` 的 `DEFAULT_PLUGINS` 为唯一清单，模板构建与运行时安装都以它为准。

## 模板如何产出（Dockerfile 目标态）

```dockerfile
FROM node:24-slim AS template-builder
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN npm i -g pnpm @deepseek-ai/dsh
ENV DSH_HOME=/opt/dsh-home-template
RUN mkdir -p $DSH_HOME/profiles/web \
    && echo "ignore-scripts=false" > $DSH_HOME/.npmrc \
    && dsh plugin --profile web add dshmarket \
    && dsh plugin --profile web add github:omdsh-dev/DSH-better-sidebar#main \
    && dsh plugin --profile web add -w @xmanrui/dsh-im \
    && dsh plugin --profile web add github:Han-1413141/dsh-cost-meter#main \
    && dsh plugin --profile web add dsh-visualize

# 模板完整性校验：任一步失败会因 && 打断 → 构建失败（不再 || echo WARN 静默吞掉）
FROM node:24-slim
RUN npm i -g pnpm
RUN npm i -g @deepseek-ai/dsh@0.1.0-rc.7
COPY --from=template-builder /opt/dsh-home-template /opt/dsh-home-template
RUN chmod -R 755 /opt/dsh-home-template
ENV TEMPLATE_DSH_HOME=/opt/dsh-home-template
# ... 其余不变
```

- 关键变化：**去掉 `|| echo WARN`**，让插件安装失败直接导致构建失败，避免静默产出不完整模板。
- 若 `github:` 源确定性无法保证，见「关键改动 3」改为全 npm 源。

## 路径无关性保证

DSH 路径解析基于 `DSH_HOME` + profile 内相对路径 + 运行期 `!!js dshHomePath(...)`；模板不硬编码绝对路径，复制到不同实例路径天然路径无关。

## 现状与目标差距（供实现回溯）

| 项 | 当前实现 | 目标规范 |
|---|---|---|
| 复制范围 | 整棵 `profiles/` | 整棵 `profiles/`（不变） |
| `DEFAULT_PLUGINS` | 已在 `config.ts` | 改为可靠 npm 源，或为 `github:` 源配 `allowBuilds` |
| 模板完整性校验 | **缺失**（只看 `node_modules` 存在） | **复制前校验全部插件已登记** |
| 标记语义 | 复制/安装后**无条件**写 `.plugins-installed` | **全部插件到位才写**；失败不写可重试 |
| `github:` 插件 | 构建期静默失败 | 可解析 + `allowBuilds`，或替换为 npm 源 |
| 存量实例 | 被空模板+标记锁死 | 删除重建/手动补装 |

## 验证要点（实现后必须实测）

1. `docker build` 后 `/opt/dsh-home-template/profiles/web/package.json` 的 `dependencies` **包含全部 `DEFAULT_PLUGINS`**。
2. 新建实例后，`home/profiles/web/package.json` 含全部插件、`web/node_modules` 有对应包、`dsh web` 启动无解析错误。
3. 模拟模板缺插件 → `copyPreinstalledPlugins` 返回 `false`，走 `installDefaultPlugins()` 逐个真装且**成功后才写标记**。
4. 任一插件失败时**不写 `.plugins-installed`**，下次可重试。

## 回滚方案

若新方案仍不可靠，回退到"运行时逐包真装为主、不依赖模板复制"：`copyPreinstalledPlugins` 直接返回 `false`，全部走 `installDefaultPlugins()`（已验证 npm 源可靠）。无数据迁移。
