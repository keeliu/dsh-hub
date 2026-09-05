# 技术方案：会员实例预置模板

## 现有代码问题

### 问题 1：`copyPreinstalledPlugins()` 复制不完整

**当前实现**（`instances.ts` 第 226-283 行）：
```typescript
// 只复制了 node_modules 和 .npmrc
const templateNodeModules = join(templateHome, 'node_modules');
const targetNodeModules = join(homePath, 'node_modules');
// ... 复制 node_modules ...

// 复制 .npmrc
const templateNpmrc = join(templateHome, '.npmrc');
// ... 复制 .npmrc ...
```

**问题**：遗漏了 Profile 目录的其他关键文件。

### 问题 2：插件安装逻辑重复

**三处创建 `.plugins-installed` 标记**：
1. `copyPreinstalledPlugins()` - 第 276 行
2. `installDefaultPlugins()` - 第 215 行
3. `spawn.ts startInstance()` - 第 89 行

**问题**：逻辑冗余，维护困难。

### 问题 3：`DEFAULT_PLUGINS` 常量重复定义

- `instances.ts` 第 19-25 行
- `spawn.ts` 第 16-22 行

**问题**：两处定义完全相同，但维护时容易不同步。

## 解决方案

### 方案选择：方案 B（Docker 多阶段构建）

**理由**：
1. **完全自动化** - 集成到现有 Dockerfile，`docker build` 时自动准备模板
2. **可重复** - 每次构建结果一致，消除人为错误
3. **版本可控** - 模板版本与代码版本绑定，便于追溯
4. **路径无关** - 在容器内构建，使用统一的临时路径，天然支持路径无关

### 路径无关性保证

**关键发现**：根据 DSH 启动链路分析，DSH 的路径解析机制是：

1. **`DSH_HOME` 环境变量** - 启动时设置，决定所有路径的根
2. **相对路径** - Profile 内的配置使用相对路径（如 `./node_modules`）
3. **动态解析** - `!!js dshHomePath('sessions')` 等函数在运行时解析

**结论**：模板目录中的配置和代码**不包含硬编码路径**，都是相对路径或运行时动态解析，所以**天然支持路径无关**。

### Docker 多阶段构建方案

**Dockerfile 修改**：

```dockerfile
# 阶段 1：构建模板
FROM node:24-slim AS template-builder

# 安装依赖
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN npm i -g pnpm @deepseek-ai/dsh

# 创建临时 home（路径固定，不影响最终模板）
ENV DSH_HOME=/tmp/dsh-template
RUN mkdir -p $DSH_HOME

# 初始化 profile 并安装插件
RUN dsh --profile web --no-open &
RUN sleep 10 && \
    dsh plugin --profile web add dshmarket && \
    dsh plugin --profile web add DSH-better-sidebar && \
    dsh plugin --profile web add dsh-im && \
    dsh plugin --profile web add dsh-cost-meter && \
    dsh plugin --profile web add dsh-visualize

# 清除敏感信息
RUN rm -f $DSH_HOME/.credentials.yaml && \
    rm -rf $DSH_HOME/sessions && \
    rm -rf $DSH_HOME/workspace

# 阶段 2：最终镜像
FROM node:24-slim

# 安装 git（dsh plugin add github:xxx 需要）
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# 装 pnpm（dsh plugin add 需要）
RUN npm i -g pnpm

# 从阶段 1 复制模板
COPY --from=template-builder /tmp/dsh-template /opt/dsh-home-template

# 设置权限
RUN chmod -R 755 /opt/dsh-home-template

# 设置环境变量
ENV TEMPLATE_DSH_HOME=/opt/dsh-home-template

# ... 其余配置不变 ...
```

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│  Docker 构建阶段 1（template-builder）                        │
│                                                             │
│  1. 安装 DSH 和 pnpm                                         │
│  2. 设置 DSH_HOME=/tmp/dsh-template                         │
│  3. 运行 dsh --profile web --no-open                        │
│  4. 安装所有默认插件                                         │
│  5. 清除敏感信息                                             │
│                                                             │
│  输出：/tmp/dsh-template（完整模板目录）                     │
└─────────────────────────────────────────────────────────────
                            │
                            │ COPY
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Docker 构建阶段 2（最终镜像）                                │
│                                                             │
│  /opt/dsh-home-template/                                    │
│  ├── profiles/                                              │
│  │   ├── web/                                               │
│  │   │   ├── package.json                                   │
│  │   │   ├── cordis.patch.yml                               │
│  │   │   ├── pnpm-lock.yaml                                 │
│  │   │   ├── pnpm-workspace.yaml                            │
│  │   │   └── node_modules/                                  │
│  │   └── node_modules/  ← 共享依赖                          │
│  └── .npmrc                                                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 运行时复制
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  用户实例（每个实例独立路径）                                 │
│                                                             │
│  <dataDir>/users/<dir_name>/instances/<id>/home/            │
│  ├── profiles/                                              │
│  │   ├── web/ (从模板复制)                                   │
│  │   └── node_modules/ (从模板复制)                          │
│  └── .npmrc (从模板复制)                                     │
│                                                             │
│  DSH_HOME=<dataDir>/users/<dir_name>/instances/<id>/home/   │
└─────────────────────────────────────────────────────────────┘
```
│  ├── profiles/                                               │
│  │   ├── web/                                                │
│  │   │   ├── package.json                                    │
│  │   │   ├── cordis.patch.yml                                │
│  │   │   ├── pnpm-lock.yaml                                  │
│  │   │   ├── pnpm-workspace.yaml                             │
│  │   │   ── node_modules/                                   │
│  │   └── node_modules/          ← 共享依赖（关键！）          │
│  └── .npmrc                                                  │
└─────────────────────────────────────────────────────────────
                            │
                            │ copyPreinstalledPlugins()
                            │ 复制整个 profiles/ 目录
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  实例 home 目录（<dataDir>/users/<dir>/instances/<id>/home） │
│  ├── profiles/                                               │
│  │   ├── web/                                                │
│  │   │   ├── package.json                                    │
│  │   │   ├── cordis.patch.yml                                │
│  │   │   ├── pnpm-lock.yaml                                  │
│  │   │   ├── pnpm-workspace.yaml                             │
│  │   │   └── node_modules/                                   │
│  │   └── node_modules/          ← 共享依赖（必须复制）        │
│  ├── .npmrc                                                  │
│  └── .plugins-installed  ← 标记文件                          │
└─────────────────────────────────────────────────────────────┘
```

### 关键发现：healProfilesModuleFallback 机制

根据 DSH 启动链路分析文章第 4.2 节：

> `healProfilesModuleFallback` 会把 dsh 安装的依赖闭包镜像到 `$DSH_HOME/profiles/node_modules`（符号链接），让 profile 里的插件和 dsh 共享同一个 Cordis 实例。

**影响**：
- 模板目录**必须包含** `profiles/node_modules/`
- 复制时必须包含此目录，否则插件可能无法正确加载 Cordis 实例
- 此目录可能是符号链接，复制时需要特殊处理

### 实现方案

#### 1. 修改 `copyPreinstalledPlugins()` 函数

**修改位置**：`dsh-hub/src/instances.ts` 第 226-283 行

**修改前**：
```typescript
function copyPreinstalledPlugins(homePath: string, instanceId: string): boolean {
  const templateHome = process.env.TEMPLATE_DSH_HOME || '/opt/dsh-home-template';
  
  // 只复制 node_modules 和 .npmrc
  const templateNodeModules = join(templateHome, 'node_modules');
  const targetNodeModules = join(homePath, 'node_modules');
  // ... 复制逻辑 ...
}
```

**修改后**：
```typescript
function copyPreinstalledPlugins(homePath: string, instanceId: string): boolean {
  const templateHome = process.env.TEMPLATE_DSH_HOME || '/opt/dsh-home-template';
  
  // 检查模板目录是否存在
  if (!existsSync(templateHome)) {
    console.log(`[instances] Template directory not found: ${templateHome}, falling back to install`);
    return false;
  }
  
  console.log(`[instances] Copying pre-installed profile from template for instance ${instanceId}...`);
  
  try {
    // 复制整个 profiles/ 目录（包含 web profile 和共享依赖）
    const templateProfilesDir = join(templateHome, 'profiles');
    const targetProfilesDir = join(homePath, 'profiles');
    
    if (existsSync(templateProfilesDir)) {
      if (!existsSync(targetProfilesDir)) {
        mkdirSync(targetProfilesDir, { recursive: true });
      }
      
      // 复制整个 profiles/ 目录（包括 web/ 和 node_modules/）
      cpSync(templateProfilesDir, targetProfilesDir, { 
        recursive: true,
        // 处理符号链接：如果是符号链接，复制实际内容
        verbatimSymlinks: false 
      });
      console.log(`[instances] ✅ Copied profiles/ directory`);
    } else {
      console.log(`[instances] ️  Template profiles directory not found: ${templateProfilesDir}`);
      return false;
    }
    
    // 复制 .npmrc
    const templateNpmrc = join(templateHome, '.npmrc');
    if (existsSync(templateNpmrc)) {
      cpSync(templateNpmrc, join(homePath, '.npmrc'));
      console.log(`[instances] ✅ Copied .npmrc`);
    }
    
    // 创建标记文件
    writeFileSync(join(homePath, '.plugins-installed'), new Date().toISOString());
    console.log(`[instances] Pre-installed profile copied successfully for instance ${instanceId}`);
    return true;
  } catch (err) {
    console.error(`[instances] Failed to copy pre-installed profile:`, err);
    return false;
  }
}
```

**关键改动**：
1. 复制整个 `profiles/` 目录（包括 `web/` 和 `node_modules/`）
2. 使用 `verbatimSymlinks: false` 处理符号链接（复制实际内容而非链接）
3. 确保 `profiles/node_modules/` 共享依赖被正确复制

#### 2. 删除 `installDefaultPlugins()` 函数

**删除位置**：`dsh-hub/src/instances.ts` 第 172-220 行

**删除调用**：`dsh-hub/src/instances.ts` 第 94 行
```typescript
// 删除这行
installDefaultPlugins(homePath, workspacePath, id).catch(err => 
  console.error(`[instances] Failed to install default plugins:`, err)
);
```

#### 3. 删除 `spawn.ts` 中的插件安装兜底逻辑

**删除位置**：`dsh-hub/src/supervisor/spawn.ts` 第 55-94 行

**删除内容**：
```typescript
// 删除这段代码
const pluginInstallFlag = join(record.home_path, '.plugins-installed');
if (!existsSync(pluginInstallFlag)) {
  console.log(`[spawn] Installing default plugins for instance ${record.id}...`);
  // ... 插件安装逻辑 ...
}
```

#### 4. 统一 `DEFAULT_PLUGINS` 常量定义

**新增位置**：`dsh-hub/src/config.ts`

```typescript
// 默认插件列表（用于文档说明和模板初始化）
export const DEFAULT_PLUGINS = [
  'dshmarket',
  'github:omdsh-dev/DSH-better-sidebar#main',
  '@xmanrui/dsh-im',
  'github:Han-1413141/dsh-cost-meter#main',
  'dsh-visualize',
];
```

**删除位置**：
- `dsh-hub/src/instances.ts` 第 19-25 行
- `dsh-hub/src/supervisor/spawn.ts` 第 16-22 行

### 关键决策

#### 1. 为什么选择方案 A 而不是方案 B？

- **方案 A（修复复制逻辑）**：改动最小，不依赖外部工具
- **方案 B（使用 dshp 工具）**：需要 `dshp` 工具可用，且可能改变实例创建流程

**决策**：选择方案 A，保留现有架构，只修复复制逻辑。

#### 2. 为什么删除 `installDefaultPlugins()` 函数？

- 模板复制已确保插件就绪，不再需要逐个安装
- 删除后简化代码逻辑，减少维护成本

#### 3. 为什么删除 `spawn.ts` 中的兜底逻辑？

- 模板复制是同步的，在实例创建时已完成
- 不再需要启动时的兜底检查

#### 4. 为什么统一 `DEFAULT_PLUGINS` 常量？

- 避免两处定义不同步
- 用于文档说明和模板初始化参考

#### 5. 如何处理 `profiles/node_modules/` 符号链接？

根据 `healProfilesModuleFallback` 机制，`profiles/node_modules/` 可能是符号链接。

**处理方案**：
- 使用 `cpSync` 的 `verbatimSymlinks: false` 选项
- 这会复制符号链接指向的实际内容，而非链接本身
- 确保每个实例都有独立的依赖副本

### 回滚方案

如果新方案出现问题，可以回滚到修改前的代码：

1. 恢复 `installDefaultPlugins()` 函数
2. 恢复 `spawn.ts` 中的插件安装兜底逻辑
3. 恢复 `instances.ts` 和 `spawn.ts` 中的 `DEFAULT_PLUGINS` 定义

回滚后，系统将恢复到逐个安装插件的模式。
