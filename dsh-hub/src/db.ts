/**
 * DSH Hub · SQLite 数据层（M1）
 *
 * 使用 Node 24 内置 `node:sqlite`（DatabaseSync）——零依赖、WAL 模式。
 * schema 与 docs/02 §4 一致（instances 表 M2 再用，这里先建好骨架）。
 * 数据根由 DSH_HUB_DATA 指定（默认 <dsh-hub>/data），DB 文件 dshhub.db。
 */
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
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
  // 多用户共机时 DB 含密码哈希/token 哈希：数据根 700、DB 文件 600（M2.1）。
  chmodSync(dataDir, 0o700);
  const dbPath = join(dataDir, 'dshhub.db');
  const db = new DatabaseSync(dbPath);
  chmodSync(dbPath, 0o600);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

/**
 * 同步事务辅助（BEGIN IMMEDIATE：立即取写锁，串行化并发写者）。
 * 注意：回调内不得出现 await（SQLite 事务不能跨事件循环让步）。
 */
export function withTx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---- Schema 迁移版本化 ----

interface Migration {
  version: number;
  description: string;
  up: (db: DatabaseSync) => void;
}

function getSchemaVersion(db: DatabaseSync): number {
  try {
    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(db: DatabaseSync, version: number): void {
  db.prepare('DELETE FROM schema_version').run();
  db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
}

/** 推断旧数据库的 schema 版本（用于没有 schema_version 表的已有数据库） */
function inferSchemaVersion(db: DatabaseSync): number {
  // 检查 orders 表是否存在 → 至少 version 4
  try {
    db.prepare('SELECT 1 FROM orders LIMIT 1').get();
    return 4;
  } catch { /* 表不存在 */ }

  // 检查 password_reset_codes 表是否存在 → 至少 version 3
  try {
    db.prepare('SELECT 1 FROM password_reset_codes LIMIT 1').get();
    return 3;
  } catch { /* 表不存在 */ }

  // 检查 users.username 列是否存在 → 至少 version 2
  try {
    const info = db.prepare("PRAGMA table_info('users')").all() as { name: string }[];
    if (info.some(col => col.name === 'username')) return 2;
  } catch { /* ignore */ }

  // 检查 users 表是否存在 → version 1
  try {
    db.prepare('SELECT 1 FROM users LIMIT 1').get();
    return 1;
  } catch { /* 表不存在 */ }

  return 0;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'initial schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY,
          nickname TEXT UNIQUE NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          dir_name TEXT UNIQUE NOT NULL,
          username TEXT UNIQUE,
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
  },
  {
    version: 2,
    description: 'add username to users',
    up: (db) => {
      try {
        db.exec('ALTER TABLE users ADD COLUMN username TEXT UNIQUE');
      } catch {
        // 列已存在，忽略
      }
    }
  },
  {
    version: 3,
    description: 'add password_reset_codes table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_codes (
          id INTEGER PRIMARY KEY,
          email TEXT NOT NULL,
          code TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          used INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
      `);
    }
  },
  {
    version: 4,
    description: 'add membership system (memberships, orders tables + users fields)',
    up: (db) => {
      // users 表新增会员相关字段
      try {
        db.exec(`ALTER TABLE users ADD COLUMN membership_type TEXT CHECK(membership_type IN ('trial','monthly','yearly'))`);
      } catch { /* 列已存在 */ }
      try {
        db.exec(`ALTER TABLE users ADD COLUMN membership_expires_at INTEGER`);
      } catch { /* 列已存在 */ }
      try {
        db.exec(`ALTER TABLE users ADD COLUMN trial_used INTEGER NOT NULL DEFAULT 0 CHECK(trial_used IN (0,1))`);
      } catch { /* 列已存在 */ }

      // 创建 memberships 表
      db.exec(`
        CREATE TABLE IF NOT EXISTS memberships (
          id INTEGER PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('trial','monthly','yearly')),
          starts_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
        CREATE INDEX IF NOT EXISTS idx_memberships_expires_at ON memberships(expires_at);
      `);

      // 创建 orders 表
      db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          membership_type TEXT NOT NULL CHECK(membership_type IN ('trial','monthly','yearly')),
          amount REAL NOT NULL CHECK(amount >= 0),
          status TEXT NOT NULL CHECK(status IN ('pending','paid','cancelled','refunded')),
          payment_method TEXT,
          payment_id TEXT,
          created_at INTEGER NOT NULL,
          paid_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
      `);
    }
  },
  {
    version: 5,
    description: 'add membership_prices table for configurable pricing',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS membership_prices (
          id INTEGER PRIMARY KEY,
          type TEXT NOT NULL UNIQUE CHECK(type IN ('trial','monthly','yearly')),
          price REAL NOT NULL CHECK(price >= 0),
          updated_at INTEGER NOT NULL
        );
      `);
    }
  },
  {
    version: 6,
    description: 'add original_price column to membership_prices for dual price display',
    up: (db) => {
      db.exec(`
        ALTER TABLE membership_prices ADD COLUMN original_price REAL NOT NULL DEFAULT 0;
      `);
      // 设置默认原价（单位：分）
      db.exec(`
        INSERT OR REPLACE INTO membership_prices (type, price, original_price, updated_at) VALUES
          ('trial', 0, 990, strftime('%s', 'now')),
          ('monthly', 1990, 2990, strftime('%s', 'now')),
          ('yearly', 19900, 29900, strftime('%s', 'now'));
      `);
    }
  }
];

/** 版本化 schema 迁移 */
export function migrate(db: DatabaseSync): void {
  // 创建 schema_version 表（如果不存在）
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`);

  let current = getSchemaVersion(db);
  // 旧数据库没有 schema_version 表，推断版本
  if (current === 0) {
    current = inferSchemaVersion(db);
    if (current > 0) {
      setSchemaVersion(db, current);
    }
  }

  for (const m of MIGRATIONS) {
    if (m.version > current) {
      try {
        db.exec('BEGIN');
        m.up(db);
        setSchemaVersion(db, m.version);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw new Error(`migration ${m.version} (${m.description}) failed: ${e}`);
      }
    }
  }
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
  | 'instance_admin'
  | 'membership_create'
  | 'membership_renew'
  | 'membership_expire'
  | 'membership_price_update'
  | 'order_create'
  | 'order_pay'
  | 'order_cancel'
  | 'payment_notify'
  | 'payment_refund';

/** 审计写入（骨架：M4 出管理端 UI 后再做过滤/浏览）。 */
export function audit(db: DatabaseSync, action: AuditAction, actorId: number | null, targetUserId: number | null, detail?: string): void {
  db.prepare('INSERT INTO audit_logs (actor_id, target_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(actorId, targetUserId, action, detail ?? null, Date.now());
}