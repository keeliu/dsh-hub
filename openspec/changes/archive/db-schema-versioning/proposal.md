# Proposal: Schema 迁移版本化

## Why

当前 `db.ts` 的 `migrate()` 函数使用 `CREATE TABLE IF NOT EXISTS` + `try/catch ALTER TABLE` 做 schema 管理。问题：

1. **无版本号**：无法知道当前数据库处于哪个 schema 版本，难以判断哪些迁移已执行。
2. **迁移不可追溯**：`ALTER TABLE ADD COLUMN` 失败时静默忽略，无法区分「列已存在」和「其他错误」。
3. **不可回滚**：没有 downgrade 机制，出错时只能删库重建。
4. **协作困难**：多人开发时，无法知道对方的 migration 是否已在自己的 DB 上执行。

## What Changes

### 引入 schema_version 表

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);
```

### 迁移注册表

```typescript
interface Migration {
  version: number;
  description: string;
  up: (db: DatabaseSync) => void;
}

const MIGRATIONS: Migration[] = [
  { version: 1, description: 'initial schema', up: initialSchema },
  { version: 2, description: 'add username to users', up: addUsernameColumn },
  // ...
];
```

### 迁移执行

```typescript
function migrate(db: DatabaseSync): void {
  const current = getSchemaVersion(db);
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      m.up(db);
      setSchemaVersion(db, m.version);
    }
  }
}
```

## Impact

- **破坏性**：无。对已有数据库，迁移逻辑向后兼容（`CREATE TABLE IF NOT EXISTS` 幂等）。
- **影响范围**：`src/db.ts`
- **风险**：低。迁移逻辑简单，只是加了版本号追踪。
- **前置依赖**：无。
