# 验收规范：管理后台管理预置插件

## 场景 1：默认清单回退

**Given** `settings` 表无 `preset_plugins` 键
**When** 调用 `getPresetPlugins(db)`
**Then** 返回 `DEFAULT_PRESET_PLUGINS`（与现 `DEFAULT_PLUGINS` 等价，5 个插件）
**And** 新建实例行为与现状一致

## 场景 2：管理员读取清单

**Given** admin/root 已登录
**When** `GET /admin/api/preset-plugins`
**Then** 200 返回 `{ plugins: PresetPlugin[] }`（含 spec/enabled/order/allowBuild/workspace）

## 场景 3：管理员整表替换清单

**Given** admin/root 已登录
**When** `PUT /admin/api/preset-plugins` body `{ plugins: [...] }`
**Then** 校验通过 → 200 写入并落 `preset_plugins_update` 审计
**And** 之后 `getPresetPlugins(db)` 返回新清单

## 场景 4：校验拒绝非法 spec

**Given** 提交的清单含非法 spec（空、空白、含 `;` / `$` / `` ` `` / `&` / `|` / `(` 等 shell 元字符、超长）
**When** `validatePresetPlugins` / `PUT /admin/api/preset-plugins`
**Then** 400 拒绝，不写入
**And** 原有清单保持不变

## 场景 5：新建实例按当前清单装载

**Given** 管理员设置清单为仅 2 个插件、且开启顺序/allowBuild/workspace 后
**When** 新建实例
**Then** `copyPreinstalledPlugins` 用当前生效清单校验模板；模板缺该清单插件 → 返回 false
**And** 运行 `installDefaultPlugins` 逐个真装**当前清单**插件（`-w` 依据单项 `workspace`、`allowBuilds` 依据单项 `allowBuild`）
**And** 全部成功才写 `.plugins-installed`

## 场景 6：模板完整时走快复制

**Given** 模板 `package.json` dependencies 覆盖当前生效清单
**When** 新建实例
**Then** 复制整棵 `profiles/`，写 `.plugins-installed`，不走运行时真装

## 场景 7：失败不写标记、可重试

**Given** 装载过程中任一当前清单插件安装失败
**When** `installDefaultPlugins`/`spawn.ts` 执行
**Then** 不写 `.plugins-installed`
**And** 下次启动/下次真装可重试；全部成功才写

## 场景 8：仅对新建实例生效

**Given** 已存在带 `.plugins-installed` 的实例
**When** 管理员修改预置清单
**Then** 已建实例保持原清单（不回溯）
**And** 移除的插件不自动从已建实例卸载（模板为构建期产物，需重建镜像/重新预置）

## 场景 9：命令无注入风险

**Given** 管理员配置的规格进入装载命令
**When** 执行 `dsh plugin --profile web add <spec>`
**Then** 使用 `spawn(bin, argv[], { shell:false })`，不经过 shell 解析
**And** 非法 spec 已被清单校验拒绝，无法注入命令

## 场景 10：后端兜底

**Given** `settings` 读取/JSON 解析抛错
**When** `getPresetPlugins(db)`
**Then** 回退 `DEFAULT_PRESET_PLUGINS`，不抛错、不阻断实例创建/启动
