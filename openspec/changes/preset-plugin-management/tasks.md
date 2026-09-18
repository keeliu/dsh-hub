# 实施清单：管理后台管理预置插件

> 规范先行：实现必须先通过 `npx tsc -p . --noEmit`；改动涉及实例创建/启动路径，需回归冒烟测试。

## 阶段 1：数据层与清单读写

- [x] 1.1 新增 `dsh-hub/src/presets.ts`
  - `PresetPlugin { spec, enabled, order, allowBuild, workspace }`
  - `DEFAULT_PRESET_PLUGINS`（与现 `DEFAULT_PLUGINS` 等价，含 allowBuild/workspace 标注）
  - `getPresetPlugins(db)` / `setPresetPlugins(db, list, actorId)`（settings 键 `preset_plugins` JSON；无/解析失败回退默认）
  - `activePresetSpecs(db)`（enabled 按 order）/ `activePresetItems(db)` / `activeAllowBuilds(db)`
  - `validatePresetPlugins(list)`（仅合法 npm 包名，拒绝 shell 元字符/空/超长）
- [x] 1.2 `config.ts`：`DEFAULT_PLUGINS` / `PROFILE_ALLOW_BUILDS` 移出（默认值改由 `presets.ts` 的 `DEFAULT_PRESET_PLUGINS` / `KNOWN_NATIVE_BUILD_DEPS` 承担）；`ensureProfileAllowBuilds(homePath, packages)` 改为接收动态列表

## 阶段 2：装载链路读动态清单

- [x] 2.1 `instances.ts`
  - `createInstance` 透传 `db` 给 `copyPreinstalledPlugins` / `installDefaultPlugins`
  - `copyPreinstalledPlugins(db, homePath, id)`：用 `activePresetSpecs(db)` 做 `templateHasAllPlugins` 校验
  - `installDefaultPlugins(db, homePath, workspacePath, id)`：遍历 `activePresetItems(db)`；`-w` 用单项 `workspace`；`ensureProfileAllowBuilds` 用 `activeAllowBuilds(db)`；全成功才写标记
- [x] 2.2 `supervisor/spawn.ts`：`startInstance` 启动兜底同样用 `activePresetItems(db)` / `activeAllowBuilds(db)` / 单项 `workspace`
- [x] 2.3 命令安全：新增 `runPluginAdd(bin, spec, workspace, opts)`，用 `spawn(bin, argv[], { shell:false })` 取代 `execSync(字符串)`；`-w` 依 `workspace` 注入
- [x] 2.4 兜底：`getPresetPlugins` 任何异常/解析失败都回退 `DEFAULT_PRESET_PLUGINS`，不阻断实例创建/启动

## 阶段 3：管理后台 API

- [x] 3.1 `api.ts` 新增：
  - `GET /admin/api/preset-plugins`（requireRole admin/root）→ `{ plugins }`
  - `PUT /admin/api/preset-plugins`（auth+csrf+requireRole）→ 校验 `validatePresetPlugins`，非法 400，合法 `setPresetPlugins` + `audit('preset_plugins_update')`

## 阶段 4：管理后台 UI

- [x] 4.1 `views/admin.ts` 新增 `renderPresetPluginsPage(user, plugins, flash?, csrf)`（表格：spec/enabled/allowBuild/workspace + 增删/上下移）
- [x] 4.2 `pages.ts` 新增 `GET /admin/plugins`，并入 admin 侧边栏
  - > 说明：写入路径统一走 `PUT /admin/api/preset-plugins`（页面 JS fetch 携带 `X-CSRF-Token`，与 `/admin/prices` 一致），因此未额外加 `POST /admin/plugins` 页面路由，避免双写路径。

## 阶段 5：验证

- [x] 5.1 `npx tsc -p . --noEmit` 通过
- [x] 5.2 未配置 `preset_plugins` 时，`GET /admin/api/preset-plugins` 返回默认 5 插件（实测）
- [ ] 5.3 手动 `PUT /admin/api/preset-plugins` 增/删/启停插件；新建实例按新清单装载（模板缺失 → 真装补齐）（**需 dsh 环境**）
- [x] 5.4 校验：非法 spec（含 `;`/`rm -rf` 等）→ 400 拒绝（实测）
- [ ] 5.5 任一生效插件装失败 → `.plugins-installed` 不写、可重试；全部成功才写（**需 dsh 环境**）
- [ ] 5.6 存量实例（已有标记）不受影响；移除插件不自动从已建实例卸载（**需 dsh 环境**）
- [ ] 5.7 冒烟回归：`bash dsh-hub/scripts/m1-smoke.sh`、`m2-smoke.sh`、`security-regression.sh`（**需 dsh 环境**）

## 阶段 6：文档与归档

- [x] 6.1 更新 `AGENTS.md`「当前进度」：管理后台预置插件管理完成（代码层）
- [x] 6.2 提交（`feat(admin): 管理后台管理预置插件（运行期清单 + 后台 UI）`）
- [ ] 6.3 归档 `openspec/changes/preset-plugin-management/` → `archive/`，功能规范合并到 `openspec/specs/`
  - > 待生产实测（5.3/5.5/5.6）通过后再归档；本环境无 `dsh`，无法跑端到端装载验证。
