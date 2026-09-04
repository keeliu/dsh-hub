# 技术方案：会员实例预置 DSH_HOME 模板

## 架构设计

### 核心组件

```
┌─────────────────────────────────────────────────────────
│  会员激活流程                                             │
─────────────────────────────────────────────────────────┤
│  1. 支付成功回调                                          │
│  2. 激活会员状态                                          │
│  3. 触发实例创建                                          │
│     ↓                                                   │
│  4. 检查模板是否存在                                      │
│     ├─ 存在 → 复制模板 → 修改配置 → 启动实例              │
│     └─ 不存在 → 降级到原有创建方式                         │
└─────────────────────────────────────────────────────────┘
```

### DSH_HOME 完整目录结构

根据 DSH 官方文档和项目架构，每个实例的 `home/` 目录（DSH_HOME）包含：

```
<instance_home>/                    # = DSH_HOME
├── profiles/
│   └── web/                        # Profile 目录
│       ├── package.json            # 依赖清单：树外插件声明
│       ├── dsh.profile             # profile 清单：bundles 列表
│       ├── pnpm-lock.yaml          # 插件锁定
│       ├── pnpm-workspace.yaml     # pnpm workspace 配置
│       ├── cordis.patch.yml        # 定制配置层
│       └── node_modules/           # 插件 bundle 实际位置
├── .credentials.yaml               # API keys（敏感，需清除）
├── .env                            # 环境变量（敏感，需清除）
└── .npmrc                          # npm 配置
```

**重要**：模板是完整的 `DSH_HOME` 目录，复制目标是每个实例的 `home/` 目录！

### 目录结构对比

```
模板目录：
/opt/dsh-home-template/
── profiles/
│   └── web/
│       ├── package.json
│       ├── dsh.profile
│       ├── pnpm-lock.yaml
│       ├── pnpm-workspace.yaml
│       ├── cordis.patch.yml
│       └── node_modules/
│           ├── dsh-cost-meter/
│           ── ...
└── .npmrc

实例目录（复制后）：
<dataDir>/users/<dir_name>/instances/<instanceId>/home/
├── profiles/
│   ── web/
│       ├── package.json
│       ├── dsh.profile
│       ├── pnpm-lock.yaml
│       ├── pnpm-workspace.yaml
│       ├── cordis.patch.yml
│       └── node_modules/
│           ├── dsh-cost-meter/
│           └── ...
└── .npmrc
```

## 实现方案

### 1. 模板管理模块（profile-template.ts）

```typescript
// 核心函数
- initTemplate(): Promise<void>           // 初始化模板
- copyTemplate(instanceHome: string): Promise<void>  // 复制模板到实例 home
- isTemplateReady(): boolean              // 检查模板是否就绪
- updateTemplate(): Promise<void>         // 更新模板
- clearSensitiveInfo(homePath: string): void  // 清除敏感信息
```

### 2. 模板初始化流程

```bash
#!/bin/bash
# scripts/init-dsh-home-template.sh

TEMPLATE_DIR="/opt/dsh-home-template"

# 创建模板目录
mkdir -p "$TEMPLATE_DIR/profiles/web"

# 初始化 web profile
dsh plugin --profile web init --home "$TEMPLATE_DIR"

# 安装基础插件
dsh plugin --profile web add dsh-cost-meter --home "$TEMPLATE_DIR"
dsh plugin --profile web add dshmarket --home "$TEMPLATE_DIR"
# ... 添加其他基础插件

echo "DSH_HOME template initialized at $TEMPLATE_DIR"
```

### 3. 实例创建流程改造

**修改前**（原有逻辑）：
```typescript
async function createInstance(userId: string) {
  // 1. 创建 Profile
  // 2. 安装插件（耗时）
  // 3. 启动实例
}
```

**修改后**（模板方案）：
```typescript
async function createInstance(userId: string) {
  const instanceHome = getInstanceHome(userId);
  
  if (isTemplateReady()) {
    // 快速路径：复制整个 DSH_HOME 模板
    await copyTemplate(instanceHome);
    clearSensitiveInfo(instanceHome);  // 清除敏感信息
    await startInstance(instanceHome);
  } else {
    // 降级路径：原有逻辑
    await createInstanceLegacy(userId);
  }
}
```

### 4. 配置修改

复制模板后需修改的配置：
- 清除 `.credentials.yaml`（API keys）
- 清除 `.env`（环境变量）
- 端口分配（从端口池获取）
- 工作目录路径
- 日志目录路径

## 关键决策

### 1. 模板复制方式

**优先方案：使用 `dshp` 工具**（如果可用）

```bash
# 导出模板
npx dshp export web -o template.dshp --home /opt/dsh-home-template

# 为实例导入
npx dshp import template.dshp --as web --home <instance_home>
```

优势：
- 自动处理所有依赖和配置
- 官方推荐，可靠性高
- 支持 `dshp clone` 快速复制、`dshp diff` 对比配置

**备选方案：手动复制整个目录**

如果 `dshp` 不可用，必须复制整个 DSH_HOME 目录：

```typescript
function copyDshHomeTemplate(srcDir: string, destDir: string): void {
  // 复制所有文件（不仅仅是 node_modules）
  cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      // 排除敏感文件
      const basename = path.basename(src);
      return !basename.startsWith('.credentials') && 
             !basename.startsWith('.env');
    }
  });
}
```

**必须复制的文件**：
- `profiles/web/package.json` - 依赖清单
- `profiles/web/dsh.profile` - profile 清单
- `profiles/web/pnpm-lock.yaml` - 插件锁定
- `profiles/web/pnpm-workspace.yaml` - pnpm workspace 配置
- `profiles/web/cordis.patch.yml` - 定制配置层
- `profiles/web/node_modules/` - 插件 bundle
- `.npmrc` - npm 配置

### 2. 模板存储位置
**选择**：`/opt/dsh-home-template/`
- 与实例目录分离，便于管理
- 使用环境变量 `TEMPLATE_DSH_HOME` 配置

### 3. 模板更新策略
**选择**：手动更新 + 版本标记
- 管理员手动执行更新脚本
- 模板目录记录创建/更新时间
- 已创建实例不受影响

### 4. 降级策略
**选择**：模板不存在时回退到原有逻辑
- 记录错误日志
- 通知管理员（可选）
- 不影响用户购买流程

### 5. 敏感信息清除
复制模板后必须清除：
- `.credentials.yaml` - API keys
- `.env` - 环境变量
- 其他用户特定的配置

## 测试策略

1. **单元测试**：模板复制、配置修改、敏感信息清除逻辑
2. **集成测试**：完整创建流程（模板存在/不存在）
3. **性能测试**：创建耗时对比（模板 vs 动态安装）
4. **压力测试**：并发创建多个实例

## 回滚方案

如果模板方案出现问题：
1. 设置配置开关 `USE_DSH_HOME_TEMPLATE = false`
2. 回退到原有创建逻辑
3. 修复模板后重新启用
