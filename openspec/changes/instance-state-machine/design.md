# Design: 实例状态机形式化

## 状态转换图

```
         ┌──────────┐
         │ stopped  │◄────────────────────┐
         └────┬─────┘                     │
              │ start                     │ reclaim/stop
              ▼                           │
         ┌──────────┐    success    ┌──────────┐
         │ starting │──────────────►│ running  │
         └────┬─────┘               └────┬─────┘
              │ fail                     │ stop/crash
              ▼                          ▼
         ┌──────────┐               ┌──────────┐
         │ failed   │◄──────────────│ stopping │
         └────┬─────┘    done       └──────────┘
              │ retry
              ▼
         ┌──────────┐
         │ starting │
         └──────────┘
```

## 实现位置

`transitionStatus` 函数放在 `supervisor/index.ts`（或 `supervisor/state.ts`），被 spawn/stop/reclaim 调用。

### 特殊情况处理

1. **reclaim 中的 stale → stopped**：reclaim 校正 stale 状态时，当前状态可能是 `starting`/`running`/`stopping`，目标状态是 `stopped`。这些转换都在转换表中。

2. **startInstance 中的 running/starting 复查**：`startInstance` 开头检查 DB 显示 running 但进程已死的情况，需要先转换到 `stopped` 再走正常流程。这个「强制重置」需要特殊处理：

```typescript
// startInstance 中的特殊重置（非正常转换，是校正）
if ((record.status === 'running' || record.status === 'starting') && !isAlive(pid)) {
  db.prepare("UPDATE instances SET status = 'stopped', pid = NULL WHERE id = ?").run(record.id);
  // 不走 transitionStatus，这是校正而非业务转换
}
```

3. **并发竞争**：`transitionStatus` 不处理并发（由 API 层的 `withInstanceOp` 互斥保证）。

## 类型定义

```typescript
export type InstanceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed';

export const VALID_TRANSITIONS: Readonly<Record<InstanceStatus, readonly InstanceStatus[]>> = {
  stopped:  ['starting'] as const,
  starting: ['running', 'failed', 'stopped'] as const,
  running:  ['stopping', 'failed'] as const,
  stopping: ['stopped', 'failed'] as const,
  failed:   ['starting', 'stopped'] as const,
};
```

## 不变更的部分

- 状态值本身不变（stopped/starting/running/stopping/failed）。
- DB schema 不变（status 列类型仍为 TEXT）。
- API 响应格式不变。
- `InstanceRecord.status` 字段类型从 `string` 收窄为 `InstanceStatus`。
