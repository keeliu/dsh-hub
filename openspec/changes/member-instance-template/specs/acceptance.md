# 验收规范：会员实例预置插件自动装载

## 场景 1：模板目录结构完整

**Given** 镜像构建完成
**When** 检查 `/opt/dsh-home-template` 目录
**Then** 存在：
- `profiles/web/package.json`
- `profiles/web/cordis.patch.yml`
- `profiles/web/pnpm-lock.yaml`
- `profiles/web/pnpm-workspace.yaml`
- `profiles/web/node_modules/`（包含所有默认插件）
- `profiles/node_modules/`（共享依赖，`healProfilesModuleFallback` 机制产物）
- `.npmrc`

## 场景 2：新建实例复制完整 Profile

**Given** 用户创建新实例
**When** `createInstance()` 调用 `copyPreinstalledPlugins()`
**Then**：
1. 实例 `home/profiles/` 存在
2. `home/profiles/web/` 完整（配置 + 插件），内容与模板一致
3. `home/profiles/node_modules/` 存在且为**实目录**（非符号链接）
4. `.npmrc` 已复制到 `home/`
5. `.plugins-installed` 标记已写

**And** 插件落盘位置为 `home/profiles/web/node_modules/`，**不是** `home/node_modules/`。

## 场景 3：复制不完整时会降级安装

**Given** 模板目录 `/opt/dsh-home-template` 不存在，或 `copyPreinstalledPlugins()` 抛错
**When** `copyPreinstalledPlugins()` 执行
**Then** 返回 `false`
**And** 不写 `.plugins-installed`
**And** 控制台输出 `Template directory not found, falling back to install`（或复制失败日志）
**And** 调用方走 `installDefaultPlugins()` 降级，实例创建不阻塞

## 场景 4：降级安装命令正确

**Given** 进入 `installDefaultPlugins()` 降级路径
**When** 遍历 `DEFAULT_PLUGINS` 逐个安装
**Then** 每条命令为 `dsh plugin --profile web add [-w] <pkg>`，`DSH_HOME=homePath`、`cwd=workspacePath`
**And** `dsh-im`（`@xmanrui/dsh-im`）使用 `-w`
**And** 安装超时 120 秒
**And** 完成后写 `.plugins-installed`

## 场景 5：首次启动兜底

**Given** 实例首次 `startInstance()`，且 `home/.plugins-installed` 不存在
**When** 启动流程进入插件检查
**Then** 执行与场景 3/4 相同的降级安装（受 marker 门控），完成后写标记再继续启动
**And** 插件安装失败不阻塞实例启动

## 场景 6：重复创建标记检查

**Given** 实例已有 `.plugins-installed`
**When** 再次执行 `copyPreinstalledPlugins()` / `installDefaultPlugins()` / 启动兜底
**Then** 安装逻辑被跳过（不重复安装），仅覆盖复制 Profile / 更新标记时间戳

## 场景 7：用户路径独立性

**Given** 用户 A 与用户 B 各有一个实例
**When** 比较两者 Profile 路径
**Then** 路径完全不同：
- `…/users/<dir_a>/instances/<id_a>/home/profiles/web/`
- `…/users/<dir_b>/instances/<id_b>/home/profiles/web/`
**And** 各自隔离、互不影响

## 场景 8：符号链接解引用

**Given** 模板中 `profiles/node_modules/` 是符号链接
**When** `copyPreinstalledPlugins()`（`verbatimSymlinks: false`）
**Then** 实例中对应目录为**实目录**（非符号链接），依赖文件完整
**原因**：每实例需独立依赖副本，避免多实例共享同一目录产生冲突。

## 场景 9：单一真相源

**When** 检查 `config.ts`
**Then** `DEFAULT_PLUGINS` 已定义于此
**And** `instances.ts` 与 `spawn.ts` 中**不存在** `DEFAULT_PLUGINS` 本地定义（改为 import）
**And** `templateDshHome`/`getTemplateDshHome()` 读取 `TEMPLATE_DSH_HOME`，`instances.ts` 不直接读 `process.env.TEMPLATE_DSH_HOME`

## 场景 10：敏感信息不复制

**Given** 模板含 `.credentials.yaml`、`sessions/`、`workspace/`
**When** 模板生产阶段与运行时复制
**Then** 上述敏感内容不出现在实例 `home/`（构建期已清理；复制仅限 `profiles/ + .npmrc`）

## 场景 11：模板更新后新实例生效

**Given** `/opt/dsh-home-template` 更新（新增插件）
**When** 创建新实例
**Then** 新实例 Profile 包含更新后的插件
**And** 已创建旧实例保持创建时状态不受影响

## 场景 12：首次启动即可用

**Given** 实例创建完成（模板复制成功）
**When** `startInstance()` 以 `DSH_HOME=<home>` 启动 `dsh web`
**Then** `dsh web` 从 `profiles/web` 启动，预设插件已加载（无需再安装）
