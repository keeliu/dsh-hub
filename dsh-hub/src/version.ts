/**
 * DSH Hub · dsh 版本白名单（M2.1）
 *
 * 背景（高危修复）：harness_version 曾作为自由字符串拼进
 * `npx --yes @deepseek-ai/dsh@<值>` 的包 spec——`file:`/`github:`/`git+` 等任意
 * npm spec 会让 npx 以 hub 进程权限执行任意代码（已实证）。
 * 本模块把该字段收紧为「显式 semver」，落实计划 §8「版本白名单锁定」。
 */
const SEMVER_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:[-+][0-9A-Za-z.-]{1,32})?$/;

/** 合法 dsh 版本：显式 semver（如 0.1.1-rc.2）。拒绝 latest、星号、^0.1.0、github:/file: 等任意 npm spec。 */
export function isValidHarnessVersion(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && SEMVER_RE.test(value);
}

/**
 * 解析白名单设置（逗号分隔的精确版本列表）。
 * 空/未设置 → null（不限制，合法 semver 全放行）；任一项非法 → null（视为未配置，避免锁死全部版本）。
 */
export function parseAllowedVersions(raw: string | undefined | null): Set<string> | null {
  if (!raw || !raw.trim()) return null;
  const set = new Set<string>();
  for (const part of raw.split(',')) {
    const v = part.trim();
    if (!isValidHarnessVersion(v)) return null;
    set.add(v);
  }
  return set.size > 0 ? set : null;
}

/** 版本是否放行（未指定版本恒放行——由调用方决定默认版本）。 */
export function versionAllowed(version: string | null | undefined, allowed: Set<string> | null): boolean {
  if (!version) return true;
  if (!isValidHarnessVersion(version)) return false;
  if (!allowed) return true;
  return allowed.has(version);
}

/** 版本解析结果。`invalid` = 不是合法 semver；`not_allowed` = 合法但不在白名单。 */
export type HarnessVersionResolution =
  | { ok: true; version: string | null }
  | { ok: false; reason: 'invalid'; version: string }
  | { ok: false; reason: 'not_allowed'; version: string };

/**
 * 版本解析的**单一真相源**：显式指定 → 回落 `default_harness_version` → 统一过白名单。
 *
 * M2.2 修复：此前只有 API 路由做了「回落默认值 + 白名单校验」，网页表单
 * （`pages.ts` 的 `POST /instances`）直接写 `form.harness_version || null`，
 * 导致两件事：①管理员配的默认版本在网页上完全不生效；②用户能从网页提交
 * 白名单外的任意版本，绕过为堵 RCE 而设的白名单。现在两条路径都只经过这里
 * （由 `instances.createInstance` 调用）。
 *
 * 默认值本身非法时**报错而不是静默忽略**——静默忽略正是本次要修的缺陷。
 */
export function resolveHarnessVersion(
  requested: unknown,
  defaultVersion?: string | null,
  allowedRaw?: string | null,
): HarnessVersionResolution {
  let version: string | null = null;
  if (typeof requested === 'string' && requested.trim() !== '') {
    const explicit = requested.trim();
    if (!isValidHarnessVersion(explicit)) return { ok: false, reason: 'invalid', version: explicit };
    version = explicit;
  } else {
    const fallback = (defaultVersion ?? '').trim();
    if (fallback !== '') {
      if (!isValidHarnessVersion(fallback)) return { ok: false, reason: 'invalid', version: fallback };
      version = fallback;
    }
  }
  if (!versionAllowed(version, parseAllowedVersions(allowedRaw))) {
    return { ok: false, reason: 'not_allowed', version: version as string };
  }
  return { ok: true, version };
}
