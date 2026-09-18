# 技术方案：管理后台管理预置插件

## 一、现状(as-is)插件装载全流程

> 以下基于当前代码（A/B/C 修正后）。目标：把"清单"从编译期常量变成运行期可配置，但**不改动既有装载执行链路**（模板复制 + 降级真装 + 启动兜底三层）。

### 1. 清单来源（现状）
```ts
// config.ts
export const DEFAULT_PLUGINS = ['dshmarket','dsh-better-sidebar','@xmanrui/dsh-im','dsh-cost-meter','dsh-visualize'];
export const PROFILE_ALLOW_BUILDS = ['node-pty'];   // 需 pnpm 批准 build 脚本的原生依赖
export function ensureProfileAllowBuilds(homePath) { /* 写 pnpm-workspace.yaml 的 allowBuilds */ }
```

### 2. 执行链路（三步）
**A. 构建期模板（Dockerfile `template-builder`）**
```
mkdir $DSH_HOME/profiles/web
写 .npmrc(ignore-scripts=false)
dsh plugin --profile web add dshmarket
printf 'allowBuilds:\n  node-pty: true\n' >> profiles/web/pnpm-workspace.yaml   # 为 dsh-better-sidebar 的 node-pty
dsh plugin --profile web add dsh-better-sidebar
dsh plugin --profile web add -w @xmanrui/dsh-im          # dsh-im 走 workspace 模式
dsh plugin --profile web add dsh-cost-meter
dsh plugin --profile web add dsh-visualize
rm -f .credentials.yaml; rm -rf sessions workspace       # 清敏感信息
# 构建期完整性校验：node -e 读 package.json，缺任一 → exit 1
输出 /opt/dsh-home-template
```

**B. 运行时 `createInstance`（instances.ts）**
```
配额检查(BEGIN IMMEDIATE) → 建 home/workspace/logs → INSERT instances
homePath = <inst>/home; workspacePath = <inst>/workspace
copied = copyPreinstalledPlugins(homePath, id)      # 同步
  ├ 模板不存在                      → false
  ├ templateHasAllPlugins(template, DEFAULT_PLUGINS) 为假 → false   # 缺插件
  └ 校验通过 → cpSync(整棵 profiles/, verbatimSymlinks:true)
              → cpSync(.npmrc) → writeFileSync(.plugins-installed) → true
if !copied:
  installDefaultPlugins(homePath, workspacePath, id).catch(...)    # 异步
    ensureProfileAllowBuilds(home) → 写 .npmrc(ignore-scripts=false)
    逐包 dsh plugin --profile web add [-w 若为 dsh-im]
    allOk 全成功 → writeFileSync(.plugins-installed)；否则不写
```

**C. 首次启动 `startInstance`（spawn.ts）**
```
若无 <home>/.plugins-installed:
  ensureProfileAllowBuilds(home) → 写 .npmrc
  逐包 dsh plugin --profile web add [-w]（同 B）
  allOk → 写标记；否则不写
再取锁 → spawn dsh web(DSH_HOME=home) → TCP 探活
```

### 3. 关键约束（设计需保留）
- **模板只是"已校验的加速缓存"**：`copyPreinstalledPlugins` 先校验模板 dependencies 覆盖清单；不满足即回退真装。
- **标记诚实**：`.plugins-installed` 只在**全部清单插件到位**后写；失败不写、可重试。
- **`-w` 与 `allowBuilds`**：目前分别靠"名称含 dsh-im"与常量 `node-pty` 推断/固定，**不能逐项配置**。

## 二、To-be 设计

### 1. 数据模型：清单存 settings（JSON），保留编译期默认
新增 `src/presets.ts`：

```ts
// 单项结构
export interface PresetPlugin {
  spec: string;        // 包 spec，如 'dshmarket' / '@xmanrui/dsh-im'；本次仅允许 npm 包名
  enabled: boolean;    // 是否参与预置
  order: number;       // 安装顺序（小→大）
  allowBuild: boolean; // 该包是否需要 pnpm 批准 build 脚本（原生依赖如 node-pty）
  workspace: boolean;  // 是否 `dsh plugin --profile web add -w`（如 dsh-im）
}

export const DEFAULT_PRESET_PLUGINS: PresetPlugin[] = [
  { spec:'dshmarket',          enabled:true, order:0, allowBuild:false, workspace:false },
  { spec:'dsh-better-sidebar', enabled:true, order:1, allowBuild:true,  workspace:false }, // node-pty
  { spec:'@xmanrui/dsh-im',    enabled:true, order:2, allowBuild:false, workspace:true  },
  { spec:'dsh-cost-meter',     enabled:true, order:3, allowBuild:false, workspace:false },
  { spec:'dsh-visualize',      enabled:true, order:4, allowBuild:false, workspace:false },
];

const SETTING_KEY = 'preset_plugins';
// 读：settings 键 → JSON；解析失败/无 → DEFAULT_PRESET_PLUGINS
export function getPresetPlugins(db): PresetPlugin[] {...}
// 写：整表替换，带校验 + 审计
export function setPresetPlugins(db, list, actorId): PresetPlugin[] {...}
// 校验：spec 为非空 npm 包名(可含 scoped @scope/name，无 shell 元字符/空白/长度>128)；order 去重后重排
export function validatePresetPlugins(list): string | null {...}
// 取"当前生效"（enabled + 按 order）的 spec 数组，供装载链路
export function activePresetSpecs(db): string[] {...}
export function activeAllowBuilds(db): string[] {...}   // 聚合 enabled 且 allowBuild 的 spec
```

### 2. 消费方改造：装载链路读动态清单
- `instances.ts::copyPreinstalledPlugins` / `installDefaultPlugins`、`spawn.ts::startInstance`：
  - `DEFAULT_PLUGINS` → `activePresetSpecs(db)`（按 order 排序、enabled）
  - `ensureProfileAllowBuilds`：由 `activeAllowBuilds(db)` 生成 `allowBuilds`（替代固定 `node-pty`）
  - `-w`：由单项 `workspace` 判定（替代 `plugin.includes('dsh-im')`）
- 函数签名需传入 `db`（`copyPreinstalledPlugins`/`installDefaultPlugins` 现无 db 参数；`spawn.ts` 已有 db）。`createInstance` 已有 db，透传即可。

> 说明：从"常量"改"读 db"是本次核心改动；确保任何读取失败/异常都回退 `DEFAULT_PRESET_PLUGINS`，不抛错破坏实例创建。

### 3. 管理后台 API（api.ts）
```
GET  /admin/api/preset-plugins   (auth; requireRole admin/root)
  → { plugins: getPresetPlugins(db) }

PUT  /admin/api/preset-plugins   (auth; csrf; requireRole admin/root)
  body { plugins: PresetPlugin[] }
  → validatePresetPlugins 校验；非法 400；合法 setPresetPlugins + audit
```

### 4. 管理后台 UI（views/admin.ts + pages.ts）
- 新增 `/admin/plugins` 页面，读/写上述 API；表格列出：spec、enabled(开关)、order(上下移)、allowBuild(勾选)、workspace(勾选)；新增行/删除行。
- 并入 admin 侧边栏 `renderAdminSidebar`（系统管理 下拉或一个"插件预置"入口）。

### 5. 模板缓存与清单的关系
- **模板是构建期"预装当前清单"的加速缓存**。运行期 `copyPreinstalledPlugins` 用 `activePresetSpecs(db)` 校验模板 `package.json` dependencies 是否覆盖**当前生效清单**：
  - 一致 → 复制（快）。
  - 不一致（管理员新加了插件/改了清单）→ 返回 false → 运行时真装**补齐当前清单**。
- **边界（文档需写明）**：
  - 新增/启用插件 → 对新实例生效（模板无 → 真装补齐）。
  - 停用/移除插件 → 模板可能仍含该插件（镜像未重建），**不会自动从新实例卸载**；如需彻底移除需重建镜像或对已建实例重新预置。
  - 已存在实例（已有 `.plugins-installed`）→ 不回溯，保持原有清单。

### 6. 安全
- `spec` 会拼进 `dsh plugin add` 命令（现为字符串 `execSync`）。一旦由管理员控制，必须：
  - `validatePresetPlugins` 只允许合法 npm 包名（`@scope/name` 或 `name`，字母数字 `-._/`，无空白、`$`、`` ` ``、`&`、`|`、`;`、`(`、`)` 等 shell 元字符）；拒绝空/超长。
  - 装载改用 `spawn(bin, [ 'plugin','--profile','web','add',  ... , spec ], { shell:false })`，消除字符串命令注入。
- 审计：`setPresetPlugins` 记录 `preset_plugins_update`（actor、specs、count）。

## 三、决策记录（Decision Log）

| 编号 | 决策 | 结论 | 理由 |
|---|---|---|---|
| P1 | 清单存储 | `settings` 表 JSON 键 `preset_plugins`，复用现有 get/setSetting | 最小新增；无需新表/迁移；已有 admin settings API 可复用 |
| P2 | 默认值 | 未配置时回退 `DEFAULT_PRESET_PLUGINS`（与现 `DEFAULT_PLUGINS` 等价） | 向后兼容；空库启动行为不变 |
| P3 | 装载语义 | 模板仍为"已校验加速缓存"，不一致走运行时真装 | 与现 `templateHasAllPlugins` 逻辑一致；改清单不破坏既有装载 |
| P4 | 逐项配置 | 每项含 spec/enabled/order/allowBuild/workspace | 替代"按名称推断 dsh-im / 固定 node-pty"，支持任意原生/workspace 插件 |
| P5 | 存量实例 | 不回溯；marker 门控；移除不自动卸载 | 避免破坏已在运行的实例 |
| P6 | 安全 | 校验 spec 格式 + 用 spawn(argv[]) 防注入 | 管理员可控 spec 后需防命令注入（standards 安全强制） |
| P7 | 模板边界 | 文档标注：新装对新建实例生效；移除需重建镜像/重新预置 | 模板是构建期产物，运行期无法 "收缩" |

## 四、回滚方案
- 保留 `DEFAULT_PRESET_PLUGINS` 常量；`getPresetPlugins` 读取失败/无数据即回退它。
- 若新方案出问题，可去掉 `settings` 读取、恢复直接用 `DEFAULT_PLUGINS`（即现状），无数据迁移。
