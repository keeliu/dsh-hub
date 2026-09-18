# 变更提案：管理后台管理预置插件（preset-plugin-management）

## Why（为什么做）

当前**预置插件列表硬编码在 `dsh-hub/src/config.ts` 的 `DEFAULT_PLUGINS` 常量**里，并被三处消费：
- `instances.ts::copyPreinstalledPlugins`（模板完整性校验 + 复制）
- `instances.ts::installDefaultPlugins`（降级逐个真装）
- `supervisor/spawn.ts::startInstance`（首次启动兜底）

同时 Dockerfile 的 `template-builder` 阶段也按这份固定清单在构建期预装成模板。

结果：**管理员想增删/启停预置插件，必须改代码、重建镜像、重发布**，无法在运行期通过管理后台调整。用户希望**在管理后台直接管理"需要预置哪些插件"**。

**目标**：把预置插件清单改为**运行期可配置**，由管理后台（admin/root）增删、排序、启停；新建实例/首次启动按"当前生效的清单"装载插件。

## 现状（as-is：预置插件安装整体流程）

当前链路（已按 A/B/C 修正后）分**模板复制（首选）**与**运行时真装（降级/兜底）**两条：

```
① Docker 构建期（template-builder 阶段）
   mkdir profiles/web + 写 .npmrc(ignore-scripts=false)
   → 逐个 dsh plugin --profile web add <npm源插件>（DEFAULT_PLUGINS）
   → 写 pnpm-workspace.yaml 的 allowBuilds（node-pty）
   → 构建期校验 package.json dependencies 覆盖全部 DEFAULT_PLUGINS（缺则构建失败）
   → 产出 /opt/dsh-home-template/profiles/web（只读模板）

② 运行时 createInstance(owner, input)
   配额检查 + 建目录(home/workspace/logs) + INSERT 实例行
   → copyPreinstalledPlugins(homePath, id)
       ① getTemplateDshHome() 模板存在？
       ② templateHasAllPlugins(template, DEFAULT_PLUGINS)？  ← 校验模板 dependencies 覆盖齐全
       ③ 齐全 → cpSync 整棵 profiles/（verbatimSymlinks）→ 写 .plugins-installed → true
       ④ 任一不满足 → 返回 false
   → 若 false → installDefaultPlugins(homePath, workspacePath, id).catch(...) 异步
       ensureProfileAllowBuilds(home) → 逐包 dsh plugin --profile web add [-w 若为 dsh-im]
       全部成功才写 .plugins-installed；任一失败不写（下次可重试）

③ 首次启动 startInstance(db, record)
   若无 .plugins-installed → 复用 ② 的逐个真装（受 marker 门控，失败不写标记）
   → 再取锁、spawn dsh web（DSH_HOME=home）→ TCP 探活
```

**当前要点**：
- 模板只作"已校验的加速缓存"，`copyPreinstalledPlugins` 会对模板**做完整性校验**（`templateHasAllPlugins`），不满足即走运行时真装。
- `DEFAULT_PLUGINS` 全部为 **npm 源**（原 2 个 `github:` 源已于 A/B/C 替换为 npm 包）。
- 完成标记 `.plugins-installed` **只在全部插件到位后写入**（失败可重试）。
- 原生依赖（如 `node-pty`）需在 profile 的 `pnpm-workspace.yaml` 配 `allowBuilds`（`PROFILE_ALLOW_BUILDS`）。

**当前限制**：清单是编译期常量；管理员无法运行期调整；`-w`（dsh-im）与 `allowBuilds` 由名称/常量推断，不可逐项配置。

## What Changes（做什么）

1. **预置插件清单改为运行期可配置**：新增 `src/presets.ts`，提供 `getPresetPlugins(db)` / `setPresetPlugins(db, list)`；清单存 `settings` 表 JSON 键（如 `preset_plugins`），无配置时回退 `DEFAULT_PLUGINS`。
2. **消费方改读动态清单**：`copyPreinstalledPlugins` / `installDefaultPlugins` / `spawn.ts` 的 `DEFAULT_PLUGINS` 替换为 `getPresetPlugins(db)`；`PROFILE_ALLOW_BUILDS` 改为按清单中每项的 `allowBuild` 判定。
3. **管理后台 API**：`GET /admin/api/preset-plugins`、`PUT /admin/api/preset-plugins`（整表替换，含校验与审计）。
4. **管理后台 UI**：新增 `/admin/plugins` 页面（增删/排序/启停/勾选 allowBuild 与 workspace），并入 admin 侧边栏。
5. **模板缓存语义明确**：构建期模板仍按"当前清单"预装（加速）；运行期 `copyPreinstalledPlugins` 校验模板是否覆盖**当前生效清单**；不一致 → 运行时真装补齐。文档标注"新装/移除插件只对新建实例生效，已建实例不回溯"。
6. **安全加固**：插件 spec 进入 `dsh plugin add` 命令，须校验为合法包 spec（拒绝含 shell 元字符/空/超长），并尽量用 `spawn(argv[])` 而非字符串命令，避免管理员注入（见 standards 安全条目）。

## Impact（影响范围）

- **受影响文件**：
  - `dsh-hub/src/presets.ts`（新增：清单读写 + 校验）
  - `dsh-hub/src/config.ts`（`DEFAULT_PLUGINS` / `PROFILE_ALLOW_BUILDS` 改为默认值/回退）
  - `dsh-hub/src/instances.ts`（消费 `getPresetPlugins`）
  - `dsh-hub/src/supervisor/spawn.ts`（消费 `getPresetPlugins`）
  - `dsh-hub/src/api.ts`（新增 admin preset-plugins 路由）
  - `dsh-hub/src/views/admin.ts`（新增 /admin/plugins 视图）
  - `dsh-hub/Dockerfile`（模板预装列表与 `getPresetPlugins` 默认一致；说明模板为缓存）
- **影响功能**：新建实例/首次启动的插件预置；管理后台插件管理。
- **风险等级**：中（涉及实例创建与启动路径；参数改为 DB 读取，需保证兜底与校验）。
- **向后兼容**：兼容。未配置 `preset_plugins` 时行为与现在一致（回退 `DEFAULT_PLUGINS`）；存量实例不受影响（marker 门控）。
