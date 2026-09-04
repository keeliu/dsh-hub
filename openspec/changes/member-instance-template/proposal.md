# 会员实例预置模板方案

## Why（为什么做）

当前会员购买后创建 DSH 实例时，需要动态安装插件，导致：
1. 创建耗时长（数分钟），用户体验差
2. 依赖外部命令（`dsh plugin`），失败风险高
3. 需要管理安装进度和错误重试

## What Changes（做什么）

采用**预置 DSH_HOME 模板**方案：
1. 制作一个标准模板 DSH_HOME 目录（`/opt/dsh-home-template/`），预装所有基础插件
2. 用户购买会员后，直接复制模板到实例的 `home/` 目录
3. 修改新实例的配置（用户标识等）
4. 启动实例

## ⚠️ 项目特殊性：每实例独立 DSH_HOME

**关键架构**：本项目中，每个 DSH 实例拥有独立的 `DSH_HOME` 目录：

```
<dataDir>/users/<dir_name>/instances/<instanceId>/
├── home/           = DSH_HOME（每实例独立）
│   ├── profiles/
│   │   └── web/    # Profile 在这里
│   ├── .credentials.yaml
│   └── .env
├── workspace/      = dsh 进程 cwd
└── logs/
```

**这意味着**：
- 模板是完整的 `DSH_HOME` 目录（不是 `~/.dsh/profiles/`）
- 复制目标是每个实例的 `home/` 目录
- 每个实例的 Profile 路径不同：`<instance_home>/profiles/web/`

## Impact（影响范围）

- **影响文件**：
  - `dsh-hub/src/instances.ts` - 实例创建逻辑（`copyPreinstalledPlugins` 函数）
  - `dsh-hub/src/membership.ts` - 会员激活逻辑
  - 可能需要新增 `dsh-hub/src/profile-template.ts` - 模板管理模块
- **影响流程**：会员激活 → 实例创建流程
- **风险等级**：中（涉及实例创建核心流程）
- **向后兼容**：需保留原有创建方式作为 fallback

## 方案对比

### 方案一：自动化脚本（不推荐）
- 每次创建需执行 `dsh plugin add` 命令
- 耗时长，用户体验差
- 依赖外部命令，失败风险高

### 方案二：预置 DSH_HOME 模板（推荐）
- 直接复制模板目录，秒级完成
- 稳定可靠，不依赖外部命令
- 用户体验好，支付后立即获得可用实例

## ️ 重要发现：当前实现的遗漏

根据 DSH 官方文档，Profile 目录结构包含以下关键文件：

```
<DSH_HOME>/profiles/web/
├── package.json          # 依赖清单：树外插件声明
├── dsh.profile           # profile 清单：bundles 列表
── pnpm-lock.yaml        # 插件锁定
├── pnpm-workspace.yaml   # pnpm workspace 配置
├── cordis.patch.yml      # 定制配置层
└── node_modules/         # 插件 bundle 实际位置
```

**当前实现问题**：
- `copyPreinstalledPlugins` 函数只复制了 `node_modules/` 和 `.npmrc`
- **遗漏了**：`package.json`、`dsh.profile`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`cordis.patch.yml`

**风险**：
- 简单的 `cp -r node_modules` 可能不完整
- 缺少 `package.json` 可能导致依赖解析问题
- 缺少 `pnpm-lock.yaml` 可能导致版本不一致

**建议方案**：
1. **优先使用 `dshp` 工具**（如果可用）：
   ```bash
   # 导出模板
   npx dshp export web -o template.dshp --home /opt/dsh-home-template
   # 为实例导入
   npx dshp import template.dshp --as web --home <instance_home>
   ```

2. **如果 `dshp` 不可用，确保复制整个 DSH_HOME 目录**：
   - 复制整个 `profiles/web/` 目录（不仅仅是 `node_modules`）
   - 清除敏感信息（`.credentials.yaml`、`.env`）
   - 修改实例特定配置
