/**
 * DSH Hub · 全局设置（M2.1 拆分）
 *
 * settings 表读写封装；键名集中声明（M2.1 起 default_harness_version 真正生效，
 * allowed_harness_versions 为新增白名单键）。
 */
import type { DatabaseSync } from 'node:sqlite';

export const SETTING_KEYS = [
  'registration_open',
  'default_harness_version', // M2.1 生效：创建实例未指定版本时的默认
  'allowed_harness_versions', // M2.1 新增：逗号分隔精确版本白名单，空=不限制
  'route_mode', // M3 预留（路由模式）
  'credential_mode', // M3 预留（凭据供给模式）
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export function getSetting(db: DatabaseSync, key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

export function getSettingsMap(db: DatabaseSync): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}
