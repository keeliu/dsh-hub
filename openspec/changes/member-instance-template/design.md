# 技术方案：会员实例预置插件自动装载

## 背景：DSH 插件是如何加载的

- 每个实例有**独立的 `DSH_HOME`**。`dsh web` 默认从 `$DSH_HOME/profiles/web` 启动 web profile。
- `dsh plugin --profile web add <pkg>` 的作用是**把剩余参数转发给 `$DSH_HOME/profiles/web` 目录下的 pnpm**：往该 profile 的 `package.json` 写入依赖、链接 `node_modules`。因此一个插件真正落盘位置是 `$DSH_HOME/profiles/web/node_modules/`。
- **`healProfilesModuleFallback` 机制**：dsh 会把安装的依赖闭包镜像到 `$DSH_HOME/profiles/node_modules`（符号链接），让 profile 里的插件与 dsh 共享同一个 Cordis 实例。因此模板/实例目录**必须包含** `profiles/node_modules/`，否则插件可能无法正确加载 Cordis 实例。

所以一个可用实例的 profile 结构为：

```
<dir>/home/
├── profiles/
│   ├── web/                       # 插件 bundle + profile 配置
│   │   ├── package.json           # 依赖清单
│   │   ├── cordis.patch.yml       # 插件/组件配置（用户可自定义）
│   │   ├── pnpm-lock.yaml         # 版本锁定
│   │   ├── pnpm-workspace.yaml    # pnpm workspace 配置
│   │   └── node_modules/          # 实际插件代码
│   └── node_modules/              # healProfilesModuleFallback 共享依赖（关键）
└── .npmrc                         # ignore-scripts=false 等 npm 配置
```

## 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│  Docker 构建阶段 1：template-builder                         │
│  1. npm i -g pnpm @deepseek-ai/dsh                          │
│  2. export DSH_HOME=/opt/dsh-home-template                  │
│  3. mkdir -p $DSH_HOME/profiles/web                         │
│  4. 逐个 dsh plugin --profile web add <pkg> 预装默认插件     │
│  5. 清理敏感信息（.credentials.yaml / sessions / workspace） │
│  输出：/opt/dsh-home-template（完整模板）                   │
└─────────────────────────────────────────────────────────────┘
            │ COPY --from=template-builder
            ▼
┌─────────────────────────────────────────────────────────────┐
│  Docker 构建阶段 2：最终镜像                                 │
│  /opt/dsh-home-template（只读模板，TEMPLATE_DSH_HOME 指向） │
└─────────────────────────────────────────────────────────────┘
            │ 运行时 copyPreinstalledPlugins()（每实例一次，复制整棵 profiles/）
            ▼
┌─────────────────────────────────────────────────────────────┐
│  用户实例 home   <dataDir>/users/<dir>/instances/<id>/home/ │
│  ├── profiles/web/*（完整，独立实目录）                     │
│  ├── profiles/node_modules/（符链解引用为实目录）           │
│  └── .npmrc + .plugins-installed                            │
│  DSH_HOME=<...>/home/ （spawn 注入）→ dsh web 从 profiles/web 启动
└─────────────────────────────────────────────────────────────┘
```

## 决策记录（Decision Log）

| 编号 | 决策 | 结论 | 理由 |
|---|---|---|---|
| D1 | 模板生产方式 | **Docker 多阶段构建**（不用手动/CI tarball） | 全自动、可重复、版本随镜像绑定、路径无关 |
| D2 | 运行时装载架构 | **保留复制架构，只修复制逻辑**（不用 `dshp`） | 不新增外部工具依赖；改动最小；保留既有异步创建流程 |
| D3 | 复制范围 | **整个 `profiles/` 目录树**（`web/` 全部文件 + `profiles/node_modules/`） | 仅复制 `node_modules` 会漏掉 profile 配置与共享依赖，插件可能无法加载 |
| D4 | 符号链接 | `cpSync(..., { recursive: true, verbatimSymlinks: false })` | 若 `profiles/node_modules/` 是符号链接，解引用为实目录，保证每实例独立依赖副本，避免多实例共享冲突 |
| D5 | 单一真相源 | `DEFAULT_PLUGINS` 收敛到 `config.ts`；`TEMPLATE_DSH_HOME` 也经 `config.ts` | 消除重复定义；符合 standards §4.2「除 config.ts 外不得直接读 process.env」 |
| D6 | 降级与安全网 | 保留 `installDefaultPlugins()`（模板缺失时）+ `spawn.ts` 启动兜底，二者均受 `.plugins-installed` 门控 | 保证模板不可用/首次启动竞态时插件最终仍被装入；marker 防重复安装 |

## 关键改动 1：修复 `copyPreinstalledPlugins()`

**当前**（`instances.ts`）：只复制 `templateHome/node_modules` 到 `homePath/node_modules`，再复制 `.npmrc`。

**目标**：

```ts
function copyPreinstalledPlugins(homePath: string, instanceId: string): boolean {
  const templateHome = config.templateDshHome;          // 经 config.ts，而非直接读 env
  if (!existsSync(templateHome)) {
    console.log(`[instances] Template directory not found: ${templateHome}, falling back to install`);
    return false;                                        // 触发降级路径
  }
  try {
    // ① 复制整棵 profiles/（含 web/ 及 profiles/node_modules/），符链解引用为实目录
    const srcProfiles = join(templateHome, 'profiles');
    const dstProfiles = join(homePath, 'profiles');
    if (existsSync(srcProfiles)) {
      mkdirSync(dstProfiles, { recursive: true });
      cpSync(srcProfiles, dstProfiles, { recursive: true, verbatimSymlinks: false });
    } else {
      return false;
    }
    // ② 复制 .npmrc（若模板有）
    const srcNpmrc = join(templateHome, '.npmrc');
    if (existsSync(srcNpmrc)) cpSync(srcNpmrc, join(homePath, '.npmrc'));
    // ③ 写 marker，门控后续安装
    writeFileSync(join(homePath, '.plugins-installed'), new Date().toISOString());
    return true;
  } catch (err) {
    console.error(`[instances] Failed to copy pre-installed profile:`, err);
    return false;                                        // 失败 → 降级
  }
}
```

要点：
- **目标路径**落在 `homePath/profiles/`（DSH 真实布局），**不是** `homePath/node_modules`（改正现状错误）。
- **`profiles/node_modules/` 必须复制**：dsh 的 `healProfilesModuleFallback` 依赖它，缺了插件可能加载不了 Cordis 实例。
- 复制失败要**返回 false**，调用方据此走降级安装，而不是静默返回 true 后标记已完成。

## 关键改动 2：统一单一真相源（config.ts）

```ts
// config.ts
export const DEFAULT_PLUGINS = [
  'dshmarket',
  'github:omdsh-dev/DSH-better-sidebar#main',
  '@xmanrui/dsh-im',
  'github:Han-1413141/dsh-cost-meter#main',
  'dsh-visualize',
] as const;

export function getTemplateDshHome(): string {
  return process.env.TEMPLATE_DSH_HOME ?? '/opt/dsh-home-template';
}
```

- `instances.ts` / `spawn.ts` 删除各自内部的 `DEFAULT_PLUGINS` 定义，改为 `import { DEFAULT_PLUGINS } from '../config.ts'`（`instances.ts` 为同目录 `./config.ts`）。
- `copyPreinstalledPlugins()` / `installDefaultPlugins()` / `spawn.ts` 均不再直接读 `process.env.TEMPLATE_DSH_HOME`。

## 关键改动 3：`installDefaultPlugins()`（降级路径，保留）

模板缺失或复制失败时使用，逐包执行 `dsh plugin --profile web add [-w] <pkg>`，`DSH_HOME=homePath`、`cwd=workspacePath`、超时 120s，`dsh-im` 加 `-w`。完成后写 `.plugins-installed`。**异步执行，不阻塞实例创建**；`spawn.ts` 作为最后安全网兜底（同样受 marker 门控）。

## 模板如何产出（Dockerfile 目标态）

```dockerfile
# 阶段 1：template-builder
FROM node:24-slim AS template-builder
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN npm i -g pnpm @deepseek-ai/dsh
ENV DSH_HOME=/opt/dsh-home-template
RUN mkdir -p $DSH_HOME/profiles/web \
    && echo "ignore-scripts=false" > $DSH_HOME/.npmrc \
    && (dsh plugin --profile web add dshmarket || echo WARN) \
    && (dsh plugin --profile web add github:omdsh-dev/DSH-better-sidebar#main || echo WARN) \
    && (dsh plugin --profile web add -w @xmanrui/dsh-im || echo WARN) \
    && (dsh plugin --profile web add github:Han-1413141/dsh-cost-meter#main || echo WARN) \
    && (dsh plugin --profile web add dsh-visualize || echo WARN) \
    && rm -f $DSH_HOME/.credentials.yaml \
    && rm -rf $DSH_HOME/sessions $DSH_HOME/workspace

# 阶段 2：最终镜像
FROM node:24-slim
RUN npm i -g pnpm
RUN npm i -g @deepseek-ai/dsh@0.1.0-rc.7
COPY --from=template-builder /opt/dsh-home-template /opt/dsh-home-template
RUN chmod -R 755 /opt/dsh-home-template
ENV TEMPLATE_DSH_HOME=/opt/dsh-home-template
# ... 其余不变（DSH_HOME_DATA 等）
```

- 模板在**构建期**准备好，镜像内为只读模板；运行时为每个实例复制一份。
- 用 `|| echo WARN` 允许单插件失败不阻断构建（与既有 Dockerfile 一致）。

## 路径无关性保证

DSH 的路径解析基于 `DSH_HOME` 环境变量 + profile 内相对路径 + 运行期 `!!js dshHomePath(...)` 动态函数。模板目录内的配置与代码**不含硬编码绝对路径**，故在同一模板复制到不同实例路径时天然路径无关。

## 现状与目标差距（供实现回溯）

| 项 | 当前代码 | 目标规范 |
|---|---|---|
| 复制范围 | 仅 `模板/node_modules` + `.npmrc` | 整棵 `profiles/` + `.npmrc` |
| 目标路径 | `homePath/node_modules`（错位） | `homePath/profiles/`（DSH 真实布局） |
| `DEFAULT_PLUGINS` | `instances.ts` + `spawn.ts` 重复定义 | 仅 `config.ts` 单一来源 |
| `TEMPLATE_DSH_HOME` 读取 | `instances.ts` 直接读 `process.env` | 经 `config.ts` |
| 降级/安全网 | 已存在 | 保留（受 marker 门控） |

## 回滚方案

若新方案出现问题，可回退到「只复制 `node_modules` + 每次逐包安装」的旧行为：恢复 `instances.ts` / `spawn.ts` 的 `DEFAULT_PLUGINS` 本地定义与 `copyPreinstalledPlugins` 旧逻辑即可。数据层面无迁移，仅目录复制策略变化，风险可控。
