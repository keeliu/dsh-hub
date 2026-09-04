# 技术方案：会员实例预置模板

## 架构设计

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│  会员激活流程                                             │
├─────────────────────────────────────────────────────────┤
│  1. 支付成功回调                                          │
│  2. 激活会员状态                                          │
│  3. 触发实例创建                                          │
│     ↓                                                   │
│  4. 检查模板是否存在                                      │
│     ├─ 存在 → 复制模板 → 修改配置 → 启动实例              │
│     └─ 不存在 → 降级到原有创建方式                         │
└─────────────────────────────────────────────────────────┘
```

### 目录结构

```
~/.dsh/profiles/
├── member-template/          # 模板 Profile（预装基础插件）
│   ├── dsh.profile
│   ├── cordis.patch.yml
│   └── plugins/
│       └── dsh-cost-meter/
├── user_123/                 # 用户实例 Profile（从模板复制）
│   ├── dsh.profile
│   ├── cordis.patch.yml
│   └── plugins/
│       └── dsh-cost-meter/
└── ...
```

## 实现方案

### 1. 模板管理模块（profile-template.ts）

```typescript
// 核心函数
- initTemplate(): Promise<void>           // 初始化模板
- copyTemplate(userId: string): Promise<string>  // 复制模板创建新 Profile
- updateTemplate(): Promise<void>         // 更新模板
- isTemplateReady(): boolean              // 检查模板是否就绪
```

### 2. 模板初始化流程

```bash
# 管理员手动执行
dsh plugin --profile member-template init
dsh plugin --profile member-template add dsh-cost-meter
# ... 添加其他基础插件
```

或提供自动化脚本：
```bash
#!/bin/bash
# scripts/init-member-template.sh
dsh plugin --profile member-template init
dsh plugin --profile member-template add dsh-cost-meter
echo "Template initialized successfully"
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
  if (isTemplateReady()) {
    // 快速路径：复制模板
    const profileDir = await copyTemplate(userId);
    await configureProfile(profileDir, userId);
    await startInstance(profileDir);
  } else {
    // 降级路径：原有逻辑
    await createInstanceLegacy(userId);
  }
}
```

### 4. 配置修改

复制模板后需修改的配置：
- `dsh.profile` 中的用户标识
- 端口分配（从端口池获取）
- 工作目录路径
- 日志目录路径

## 关键决策

### 1. 模板存储位置
**选择**：`~/.dsh/profiles/member-template/`
- 与用户 Profile 同目录，便于管理
- 使用特殊命名（`member-` 前缀）区分

### 2. 模板更新策略
**选择**：手动更新 + 版本标记
- 管理员手动执行更新命令
- 模板目录记录创建/更新时间
- 已创建实例不受影响

### 3. 降级策略
**选择**：模板不存在时回退到原有逻辑
- 记录错误日志
- 通知管理员（可选）
- 不影响用户购买流程

### 4. 插件列表管理
**选择**：配置文件定义基础插件列表
```json
// config/member-plugins.json
{
  "basePlugins": [
    "dsh-cost-meter",
    "dsh-market"
  ]
}
```

## 测试策略

1. **单元测试**：模板复制、配置修改逻辑
2. **集成测试**：完整创建流程（模板存在/不存在）
3. **性能测试**：创建耗时对比（模板 vs 动态安装）
4. **压力测试**：并发创建多个实例

## 回滚方案

如果模板方案出现问题：
1. 设置配置开关 `USE_PROFILE_TEMPLATE = false`
2. 回退到原有创建逻辑
3. 修复模板后重新启用
