# Proposal: 实例状态机形式化

## Why

当前实例状态（stopped/starting/running/stopping/failed）的转换散落在 `supervisor/spawn.ts`、`stop.ts`、`reclaim.ts` 中，用字符串字面量表示。问题：

1. **非法转换不可检测**：如 `stopped → running`（跳过 starting）不会报错，但逻辑上不正确。
2. **状态值拼写错误不报错**：`'runnng'` 不会在编译期被发现（TypeScript 类型是 `string`）。
3. **新增状态困难**：如果未来需要 `paused`、`updating` 等状态，需要全局搜索所有字符串比较。

## What Changes

### 1. 状态类型化

```typescript
export type InstanceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed';
```

### 2. 显式状态转换表

```typescript
const VALID_TRANSITIONS: Record<InstanceStatus, InstanceStatus[]> = {
  stopped:  ['starting'],
  starting: ['running', 'failed', 'stopped'],
  running:  ['stopping', 'failed'],
  stopping: ['stopped', 'failed'],
  failed:   ['starting', 'stopped'],
};
```

### 3. 状态转换函数

```typescript
function transitionStatus(db: DatabaseSync, id: string, to: InstanceStatus): void {
  const current = getInstance(db, id)?.status;
  if (!current) throw new Error(`instance ${id} not found`);
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed.includes(to)) {
    throw new Error(`invalid transition: ${current} → ${to} (instance ${id})`);
  }
  db.prepare('UPDATE instances SET status = ? WHERE id = ?').run(to, id);
}
```

## Impact

- **破坏性**：无。当前合法的状态转换不受影响。
- **影响范围**：`src/supervisor/` 目录下的 spawn/stop/reclaim
- **风险**：低。只是加了校验层，不改变实际状态转换逻辑。
- **前置依赖**：建议在 `supervisor-modularization` 之后执行（此时 supervisor 已拆分为子模块，改动更集中）。
