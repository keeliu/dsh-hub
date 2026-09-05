# 会员实例预置模板方案

## Why（为什么做）

当前会员购买后创建 DSH 实例时，需要逐个安装插件（`dsh plugin add`），耗时较长（可能数分钟），用户体验差。

### 现有代码分析

#### 两处插件安装逻辑

**位置 1：`instances.ts` - `installDefaultPlugins()` 函数（第 172-220 行）**
- 在 `createInstance()` 中被调用（第 94 行）
- 异步执行，不阻塞实例创建
- 使用 `dsh plugin --profile web add` 命令逐个安装插件
- 创建 `.plugins-installed` 标记文件

**位置 2：`spawn.ts` - `startInstance()` 函数（第 55-94 行）**
- 在首次启动时检查 `.plugins-installed` 标记
- 如果标记不存在，再次执行插件安装
- 这是**兜底逻辑**，防止 `createInstance` 中的异步安装未完成

#### 新增的 `copyPreinstalledPlugins()` 函数（第 226-283 行）

- 在 `createInstance()` 中被调用（第 88 行）
- 从模板目录复制 `node_modules` 和 `.npmrc`
- 也创建 `.plugins-installed` 标记文件
- **问题**：只复制了 `node_modules`，没有复制完整的 Profile 目录

### 现有代码冲突分析

#### ⚠️ 冲突 1：`.plugins-installed` 标记文件重复创建

| 函数 | 创建标记文件 | 位置 |
|------|------------|------|
| `copyPreinstalledPlugins()` | 第 276 行 | `homePath/.plugins-installed` |
| `installDefaultPlugins()` | 第 215 行 | `homePath/.plugins-installed` |
| `spawn.ts startInstance()` | 第 89 行 | `homePath/.plugins-installed` |

**问题**：如果 `copyPreinstalledPlugins()` 成功，会创建标记文件，导致 `installDefaultPlugins()` 和 `spawn.ts` 中的安装逻辑都被跳过。但如果复制不完整（只复制了 `node_modules`），插件可能无法正常工作。

#### ⚠️ 冲突 2：`copyPreinstalledPlugins()` 复制不完整

**当前复制内容**：
- ✅ `node_modules/` 中的插件
- ✅ `.npmrc`

**遗漏内容**（根据 DSH Profile 标准结构和启动链路分析）：

| 文件/目录 | 作用 | 来源 |
|----------|------|------|
| `profiles/web/package.json` | 依赖清单（由 dsh plugin 管理） | DSH 官方文档 |
| `profiles/web/cordis.patch.yml` | 插件配置（用户可自定义） | DSH 启动链路分析 |
| `profiles/web/pnpm-lock.yaml` | 插件版本锁定 | pnpm 标准 |
| `profiles/web/pnpm-workspace.yaml` | pnpm workspace 配置 | pnpm 标准 |
| `profiles/node_modules/` | **共享依赖**（Cordis 实例共享） | `healProfilesModuleFallback` 机制 |

**关键发现**：根据 DSH 启动链路分析文章第 4.2 节：

> `healProfilesModuleFallback` 会把 dsh 安装的依赖闭包镜像到 `$DSH_HOME/profiles/node_modules`（符号链接），让 profile 里的插件和 dsh 共享同一个 Cordis 实例。

这意味着模板目录**必须包含** `profiles/node_modules/`，否则插件可能无法正确加载 Cordis 实例。

#### ⚠️ 冲突 3：`DEFAULT_PLUGINS` 常量重复定义

- `instances.ts` 第 19-25 行定义了一次
- `spawn.ts` 第 16-22 行又定义了一次

**问题**：两处定义完全相同，但维护时容易不同步。

### 本项目特殊性

本项目采用**每实例独立 DSH_HOME** 架构，每个实例拥有独立的 Profile 目录：

```
<dataDir>/users/<dir_name>/instances/<instanceId>/home/
└── profiles/
    ├── web/                        ← 每个实例的 Profile 路径不同
    │   ├── package.json            # 依赖清单
    │   ├── cordis.patch.yml        # 插件配置
    │   ├── pnpm-lock.yaml          # 版本锁定
    │   ├── pnpm-workspace.yaml     # workspace 配置
    │   └── node_modules/           # 插件 bundle
    └── node_modules/               ← 共享依赖（Cordis 实例共享）
```

这与 DSH 默认的全局 `~/.dsh/profiles/` 不同，模板方案需要适配这种独立路径架构。

### 模板目录完整结构

根据 DSH 启动链路分析，模板目录应包含：

```
/opt/dsh-home-template/
├── profiles/
│   ├── web/
│   │   ├── package.json          # 依赖清单（由 dsh plugin 管理）
│   │   ├── cordis.patch.yml      # 插件配置（用户可自定义）
│   │   ├── pnpm-lock.yaml        # 版本锁定
│   │   ├── pnpm-workspace.yaml   # workspace 配置
│   │   └── node_modules/         # 插件 bundle
│   └── node_modules/             # 共享依赖（healProfilesModuleFallback 机制）
└── .npmrc                        # npm 配置
```

**关键**：`profiles/node_modules/` 是共享依赖目录，由 `healProfilesModuleFallback` 机制创建，让所有 profile 共享同一个 Cordis 实例。

## What Changes（做什么）

采用**方案 A（保留现有架构，修复复制逻辑）**：

1. **修复 `copyPreinstalledPlugins()` 函数**：复制完整的 Profile 目录，而不仅仅是 `node_modules`
2. **删除 `installDefaultPlugins()` 函数**：不再需要逐个安装插件
3. **删除 `spawn.ts` 中的插件安装兜底逻辑**：模板复制已确保插件就绪
4. **统一 `DEFAULT_PLUGINS` 常量定义**：提取到公共文件，用于文档说明

## Impact（影响范围）

- **影响文件**：
  - `dsh-hub/src/instances.ts`（修改 `copyPreinstalledPlugins()`，删除 `installDefaultPlugins()`）
  - `dsh-hub/src/supervisor/spawn.ts`（删除插件安装兜底逻辑）
  - `dsh-hub/src/config.ts`（新增 `DEFAULT_PLUGINS` 常量）
- **影响功能**：会员购买后实例创建流程
- **风险等级**：中（涉及实例创建流程改造）
- **向后兼容**：兼容（保留标记文件检查逻辑）

## 方案对比

### 方案 A：保留现有架构，修复复制逻辑（推荐）

**调整内容**：
1. 修改 `copyPreinstalledPlugins()` 复制完整的 Profile 目录
2. 删除 `installDefaultPlugins()` 函数
3. 删除 `spawn.ts` 中的插件安装兜底逻辑
4. 统一 `DEFAULT_PLUGINS` 常量定义

**优点**：
- 改动最小，风险可控
- 不依赖外部工具（`dshp` 可能不可用）
- 保留现有的异步创建流程

**缺点**：
- 仍然依赖模板目录的完整性

### 方案 B：完全重构，使用 `dshp` 工具

**调整内容**：
1. 新增 `initInstanceFromTemplate()` 函数
2. 使用 `dshp import` 命令从模板创建实例
3. 删除所有现有的插件安装逻辑

**优点**：
- 最可靠，由 DSH 官方工具处理
- 代码最简洁

**缺点**：
- 依赖 `dshp` 工具可用
- 需要改变实例创建流程
