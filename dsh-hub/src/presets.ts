/**
 * DSH Hub · 预置插件清单（运行期可配置）
 *
 * 清单存 `settings` 表 JSON 键 `preset_plugins`；无配置 / JSON 解析失败 / 校验不过
 * 一律**回退 `DEFAULT_PRESET_PLUGINS`**（与历史 `DEFAULT_PLUGINS` 等价），绝不抛错。
 *
 * 消费方：
 *   - `instances.ts::copyPreinstalledPlugins` / `installDefaultPlugins`
 *   - `supervisor/spawn.ts::startInstance`（启动兜底）
 * 均读 `activePresetSpecs` / `activeAllowBuilds`（替代原编译期常量）。
 *
 * 模块头：单一真相源；后台可增删/排序/启停，见 openspec/changes/preset-plugin-management/。
 */
import type { DatabaseSync } from 'node:sqlite';
import { audit } from './db.ts';
import { getSetting, setSetting } from './settings.ts';

export interface PresetPlugin {
  /** 包 spec：仅允许合法 npm 包名（可含 scope，如 `@scope/name`）。 */
  spec: string;
  /** 是否参与预置。 */
  enabled: boolean;
  /** 安装顺序（小→大）。 */
  order: number;
  /** 该插件（或其原生依赖）是否需要 pnpm 批准 build 脚本（如 node-pty）。 */
  allowBuild: boolean;
  /** 是否以 `dsh plugin --profile web add -w` 安装（workspace 模式，如 dsh-im）。 */
  workspace: boolean;
}

/** settings 表键名。 */
export const PRESET_PLUGINS_KEY = 'preset_plugins';

/** 默认清单（与历史 DEFAULT_PLUGINS 等价，补充 allowBuild / workspace 标注）。 */
export const DEFAULT_PRESET_PLUGINS: PresetPlugin[] = [
  { spec: 'dshmarket',          enabled: true, order: 0, allowBuild: false, workspace: false },
  { spec: 'dsh-better-sidebar', enabled: true, order: 1, allowBuild: true,  workspace: false }, // 依赖 node-pty（原生）
  { spec: '@xmanrui/dsh-im',    enabled: true, order: 2, allowBuild: false, workspace: true  },
  { spec: 'dsh-cost-meter',     enabled: true, order: 3, allowBuild: false, workspace: false },
  { spec: 'dsh-visualize',      enabled: true, order: 4, allowBuild: false, workspace: false },
];

/**
 * 已知的、被插件**间接引入**、需要 pnpm 批准 build 脚本的原生依赖。
 * 无法从插件清单自动发现（需查 npm 依赖树），故此处显式声明；
 * 与 `activeAllowBuilds` 合并写入 profile 的 `pnpm-workspace.yaml`。
 */
export const KNOWN_NATIVE_BUILD_DEPS: readonly string[] = ['node-pty'];

/** npm 包名（可含 scope）；拒绝空、空白、shell 元字符与超长。 */
const SPEC_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const MAX_SPEC_LEN = 128;
const MAX_PLUGINS = 64;

/** 校验清单；返回错误信息（null = 通过）。 */
export function validatePresetPlugins(list: unknown): string | null {
  if (!Array.isArray(list)) return 'plugins 必须是数组';
  if (list.length > MAX_PLUGINS) return `插件数量过多（>${MAX_PLUGINS}）`;
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const item = list[i] as Partial<PresetPlugin> | null | undefined;
    if (!item || typeof item !== 'object') return `第 ${i + 1} 项不是对象`;
    const { spec, enabled, order, allowBuild, workspace } = item;
    if (typeof spec !== 'string' || spec.length === 0 || spec.length > MAX_SPEC_LEN) {
      return `第 ${i + 1} 项 spec 非法（空或超长）`;
    }
    if (!SPEC_RE.test(spec)) return `第 ${i + 1} 项 spec 非法（仅允许合法 npm 包名）：${spec}`;
    if (seen.has(spec)) return `重复的 spec：${spec}`;
    seen.add(spec);
    if (typeof enabled !== 'boolean') return `第 ${i + 1} 项 enabled 必须是布尔`;
    if (!Number.isInteger(order) || (order as number) < 0) return `第 ${i + 1} 项 order 必须是非负整数`;
    if (typeof allowBuild !== 'boolean') return `第 ${i + 1} 项 allowBuild 必须是布尔`;
    if (typeof workspace !== 'boolean') return `第 ${i + 1} 项 workspace 必须是布尔`;
  }
  return null;
}

/** 归一化：按 order 升序重排为 0..n-1（去重排序）。 */
function normalize(list: PresetPlugin[]): PresetPlugin[] {
  return [...list]
    .sort((a, b) => a.order - b.order)
    .map((p, i) => ({ spec: p.spec, enabled: p.enabled, order: i, allowBuild: p.allowBuild, workspace: p.workspace }));
}

/** 读取清单（settings JSON）；无 / 解析失败 / 非法 → 回退默认，绝不抛错。 */
export function getPresetPlugins(db: DatabaseSync): PresetPlugin[] {
  const fallback = (): PresetPlugin[] => DEFAULT_PRESET_PLUGINS.map((p) => ({ ...p }));
  try {
    const raw = getSetting(db, PRESET_PLUGINS_KEY, '');
    if (!raw) return fallback();
    const parsed = JSON.parse(raw) as unknown;
    if (validatePresetPlugins(parsed) !== null) return fallback();
    return normalize(parsed as PresetPlugin[]);
  } catch {
    return fallback();
  }
}

/**
 * 整表替换（调用方应先用 validatePresetPlugins 校验并处理 400）。
 * 写入 settings + 审计；返回归一化后的清单。
 */
export function setPresetPlugins(db: DatabaseSync, list: PresetPlugin[], actorId: number | null): PresetPlugin[] {
  const normalized = normalize(list);
  setSetting(db, PRESET_PLUGINS_KEY, JSON.stringify(normalized));
  const specs = normalized.filter((p) => p.enabled).map((p) => p.spec).join(', ');
  audit(db, 'preset_plugins_update', actorId, null, `preset plugins updated (${normalized.length}): ${specs}`);
  return normalized;
}

/** 当前生效的插件 spec（enabled，按 order 升序）。 */
export function activePresetSpecs(db: DatabaseSync): string[] {
  return getPresetPlugins(db).filter((p) => p.enabled).map((p) => p.spec);
}

/** 当前生效的 [PresetPlugin]（enabled，按 order 升序），供装载链路逐项读取 workspace/allowBuild。 */
export function activePresetItems(db: DatabaseSync): PresetPlugin[] {
  return getPresetPlugins(db).filter((p) => p.enabled);
}

/**
 * 生成 profile `pnpm-workspace.yaml` 的 allowBuilds 包名列表：
 * - enabled 且 allowBuild 的插件 spec（插件自身若有 build 脚本）
 * - 已知原生依赖（如 node-pty，被 dsh-better-sidebar 间接引入）
 * 去重返回。
 */
export function activeAllowBuilds(db: DatabaseSync): string[] {
  const specs = getPresetPlugins(db).filter((p) => p.enabled && p.allowBuild).map((p) => p.spec);
  return Array.from(new Set<string>([...specs, ...KNOWN_NATIVE_BUILD_DEPS]));
}
