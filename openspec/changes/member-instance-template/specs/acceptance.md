# 验收规范：会员实例预置模板

## 场景 1：模板目录初始化

**Given** 服务器上存在 `/opt/dsh-home-template` 目录
**When** 目录包含完整的 Profile 结构（`profiles/` 及其所有子目录）
**Then** 目录结构符合 DSH Profile 标准：
- `profiles/web/package.json` 存在
- `profiles/web/cordis.patch.yml` 存在
- `profiles/web/pnpm-lock.yaml` 存在
- `profiles/web/pnpm-workspace.yaml` 存在
- `profiles/web/node_modules/` 包含所有默认插件
- `profiles/node_modules/` 存在（共享依赖，由 `healProfilesModuleFallback` 机制创建）

## 场景 2：会员购买后快速创建实例

**Given** 用户购买会员并触发实例创建
**When** `createInstance()` 被调用
**Then** 实例创建流程执行以下步骤：
1. 创建用户目录和实例目录
2. 调用 `copyPreinstalledPlugins()` 从模板复制完整 Profile
3. 创建 `.plugins-installed` 标记文件
4. 实例创建完成，无需等待插件安装

**And** 实例的 `home/profiles/web/` 目录包含所有配置文件和插件
**And** 实例的 `home/profiles/node_modules/` 目录包含共享依赖

## 场景 3：模板目录不存在时降级处理

**Given** 模板目录 `/opt/dsh-home-template` 不存在
**When** `copyPreinstalledPlugins()` 被调用
**Then** 函数返回 `false`
**And** 控制台输出降级日志：`Template directory not found, falling back to install`
**And** 实例创建流程继续（不阻塞）

## 场景 4：实例目录完整性验证

**Given** 实例创建完成
**When** 检查实例的 `home/profiles/` 目录
**Then** 目录包含以下文件：

### `profiles/web/` 目录
- `package.json`
- `cordis.patch.yml`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `node_modules/` 包含所有默认插件

### `profiles/node_modules/` 目录
- 共享依赖（Cordis 实例共享）
- 内容与模板目录中的对应文件一致

**And** 每个文件的内容与模板目录中的对应文件一致

## 场景 5：用户路径独立性验证

**Given** 两个不同用户的实例
**When** 比较两个实例的 `home/profiles/web/` 目录路径
**Then** 路径完全不同：
- 用户 A：`<dataDir>/users/<dir_a>/instances/<id_a>/home/profiles/web/`
- 用户 B：`<dataDir>/users/<dir_b>/instances/<id_b>/home/profiles/web/`

**And** 每个实例的 Profile 目录相互隔离，互不影响

## 场景 6：重复创建标记文件检查

**Given** 实例已创建完成（`.plugins-installed` 标记文件存在）
**When** 再次调用 `copyPreinstalledPlugins()`
**Then** 函数正常执行（不检查标记文件）
**And** 覆盖复制 Profile 目录
**And** 更新 `.plugins-installed` 标记文件的时间戳

## 场景 7：代码清理验证

**Given** 代码重构完成
**When** 检查 `instances.ts` 文件
**Then** `installDefaultPlugins()` 函数已被删除
**And** `createInstance()` 中不再调用 `installDefaultPlugins()`

**When** 检查 `spawn.ts` 文件
**Then** 插件安装兜底逻辑已被删除
**And** 只保留 `ensureInstanceDirs()` 和启动逻辑

**When** 检查 `config.ts` 文件
**Then** `DEFAULT_PLUGINS` 常量已定义
**And** `instances.ts` 和 `spawn.ts` 中不再定义 `DEFAULT_PLUGINS`

## 场景 8：模板更新后新实例使用新模板

**Given** 模板目录 `/opt/dsh-home-template` 已更新（添加新插件）
**When** 创建新实例
**Then** 新实例的 Profile 目录包含更新后的插件
**And** 已创建的旧实例不受影响（保持创建时的状态）

## 场景 9：敏感信息清除

**Given** 模板目录包含敏感信息（如 `.credentials.yaml`、`.env`）
**When** `copyPreinstalledPlugins()` 执行复制
**Then** 敏感文件不应被复制到实例目录
**And** 或复制后自动清除敏感信息

## 场景 10：共享依赖目录复制验证

**Given** 模板目录包含 `profiles/node_modules/` 目录
**When** `copyPreinstalledPlugins()` 执行复制
**Then** 实例的 `home/profiles/node_modules/` 目录存在
**And** 目录内容与模板目录一致
**And** 如果模板中的 `profiles/node_modules/` 是符号链接，复制后应为实际目录（非符号链接）

**理由**：根据 `healProfilesModuleFallback` 机制，`profiles/node_modules/` 可能是符号链接。复制时应使用 `verbatimSymlinks: false` 选项，确保复制实际内容而非链接本身。

## 场景 11：符号链接处理验证

**Given** 模板目录中的 `profiles/node_modules/` 是符号链接
**When** `copyPreinstalledPlugins()` 执行复制
**Then** 实例目录中的 `profiles/node_modules/` 是实际目录（非符号链接）
**And** 目录内容完整，包含所有依赖文件

**理由**：每个实例应有独立的依赖副本，避免多个实例共享同一目录导致的冲突。
