# Design: Schema 迁移版本化

## 迁移框架

```typescript
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
    return 0; // schema_version 表不存在
  }
}

function setSchemaVersion(db: DatabaseSync, version: number): void {
  db.prepare('DELETE FROM schema_version').run();
  db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
}

function migrate(db: DatabaseSync): void {
  const current = getSchemaVersion(db);
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
```

## 初始迁移定义

```typescript
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'initial schema',
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS users (...)`);
      db.exec(`CREATE TABLE IF NOT EXISTS sessions (...)`);
      db.exec(`CREATE TABLE IF NOT EXISTS api_tokens (...)`);
      db.exec(`CREATE TABLE IF NOT EXISTS instances (...)`);
      db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (...)`);
      db.exec(`CREATE TABLE IF NOT EXISTS settings (...)`);
    }
  },
  {
    version: 2,
    description: 'add username to users',
    up: (db) => {
      db.exec('ALTER TABLE users ADD COLUMN username TEXT UNIQUE');
    }
  },
  {
    version: 3,
    description: 'add password_reset_codes table',
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS password_reset_codes (...)`);
    }
  },
];
```

## 旧数据库兼容

对于没有 `schema_version` 表的旧数据库：
1. `getSchemaVersion` 返回 0。
2. 所有迁移依次执行。
3. `CREATE TABLE IF NOT EXISTS` 确保已存在的表不重复创建。
4. `ALTER TABLE ADD COLUMN` 对已存在的列会抛错——需要在迁移函数内 `try/catch`。

更精确的做法：在 version 1 的迁移中检测已有表，推断版本号：

```typescript
function inferSchemaVersion(db: DatabaseSync): number {
  // 检查 password_reset_codes 表是否存在 → 至少 version 3
  // 检查 users.username 列是否存在 → 至少 version 2
  // 否则 → version 1
}
```

## 不变更的部分

- 表结构不变。
- PRAGMA 设置不变（WAL、foreign_keys）。
- `withTx` 函数不变。
- `audit` 函数不变。
