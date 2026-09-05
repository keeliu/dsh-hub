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

---

# 补充验收：生产根因修正（A/B/C）

## 场景 13：模板完整性与插件齐全

**Given** 镜像构建完成
**When** 检查 `/opt/dsh-home-template/profiles/web/package.json` 的 `dependencies`
**Then** 覆盖**全部 `DEFAULT_PLUGINS`**
**And** 不再因 `|| echo WARN` 而静默容忍缺插件（任一插件安装失败即构建失败）
**And** `dsh.profile.bundles` 也包含全部默认插件

## 场景 14：复制前校验完整性

**Given** 模板存在但**缺插件**（`web/package.json` 的 `dependencies` 未覆盖全部 `DEFAULT_PLUGINS`）
**When** `copyPreinstalledPlugins()` 执行
**Then** 返回 `false`
**And** **不写** `.plugins-installed`
**And** 控制台输出 `Template profile incomplete (missing plugins), falling back to install`
**And** 走 `installDefaultPlugins()` 逐个真装

## 场景 15：标记只在齐全后写

**Given** 进行 `copyPreinstalledPlugins()` / `installDefaultPlugins()` / `spawn.ts` 安装
**When** 任一 `DEFAULT_PLUGINS` 安装失败
**Then** **不写** `.plugins-installed`，记录失败，下次可重试
**When** 全部插件到位
**Then** 才写 `.plugins-installed`

## 场景 16：github 源插件可安装或已替换

**Given** `DEFAULT_PLUGINS` 含 `github:` 源插件
**When** 安装
**Then** 该源的 build/prepare 脚本已被允许（profile 的 `pnpm-workspace.yaml` 配了 `allowBuilds`）
**And** 其 git ref 可解析（不存在 `Could not resolve ... to a commit` 错误）
**Or** `github:` 源已替换为/等价于 npm 源，全部插件可从 npm registry 成功安装

## 场景 17：存量实例处理

**Given** 既有实例 `i-*` 早期在空/缺插件模板下创建、且已带 `.plugins-installed`
**When** 采用本修正
**Then** 该实例被删除重建，或手动 `dsh plugin --profile web add` 逐个补齐并处理 `allowBuilds`
**And** 补装后 `web/package.json` 的 `dependencies` 覆盖全部 `DEFAULT_PLUGINS`

## 场景 18：端到端生效

**Given** 修正完成并重建镜像/清理存量
**When** 新建一个实例并启动 `dsh web`
**Then** `home/profiles/web/package.json` 含全部 `DEFAULT_PLUGINS`
**And** `home/profiles/web/node_modules/` 有对应插件包
**And** `dsh web` 启动日志无"模块/依赖解析失败"
**And** 实例运行时预设插件可用
