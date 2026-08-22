/**
 * DSH Hub · SQLite 数据层（M1）
 *
 * 使用 Node 24 内置 `node:sqlite`（DatabaseSync）——零依赖、WAL 模式。
 * schema 与 docs/02 §4 一致（instances 表 M2 再用，这里先建好骨架）。
 * 数据根由 DSH_HUB_DATA 指定（默认 <dsh-hub>/data），DB 文件 dshhub.db。
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export interface DbOptions {
  /** 数据根目录（含 db 文件与后续 users/ 目录）。 */
  dataDir?: string;
}

export function openDb(opts: DbOptions = {}): DatabaseSync {
  const dataDir = opts.dataDir ?? process.env.DSH_HUB_DATA ?? join(here, '..', 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'dshhub.db'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

/** 幂等建表 + 轻量迁移（当前只有 v1 schema）。 */
export function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      nickname TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      dir_name TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','admin','root')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
      max_instances INTEGER NOT NULL DEFAULT 3,
      max_running INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      ip TEXT,
      ua TEXT
    );
    CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS instances (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      port INTEGER UNIQUE,
      home_path TEXT,
      workspace_path TEXT,
      harness_version TEXT,
      trusted_host TEXT,
      status TEXT NOT NULL DEFAULT 'stopped',
      pid INTEGER,
      auto_restart INTEGER NOT NULL DEFAULT 0,
      mem_max_mb INTEGER,
      cpu_quota_pct INTEGER,
      created_at INTEGER NOT NULL,
      last_started_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY,
      actor_id INTEGER,
      target_user_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export type AuditAction =
  | 'setup'
  | 'register'
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'token_issue'
  | 'token_revoke'
  | 'user_create'
  | 'user_update'
  | 'user_disable'
  | 'user_enable'
  | 'password_reset'
  | 'instance_create'
  | 'instance_start'
  | 'instance_stop'
  | 'instance_restart'
  | 'instance_delete'
  | 'instance_admin';

/** 审计写入（骨架：M4 出管理端 UI 后再做过滤/浏览）。 */
export function audit(db: DatabaseSync, action: AuditAction, actorId: number | null, targetUserId: number | null, detail?: string): void {
  db.prepare('INSERT INTO audit_logs (actor_id, target_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(actorId, targetUserId, action, detail ?? null, Date.now());
}