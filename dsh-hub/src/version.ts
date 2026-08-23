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
