# Proposal: supervisor 模块拆分

## Why

当前 `supervisor.ts`（440 行）包含 7 个关注点：spawn、stop、reclaim、锁管理、pidfile、日志、TCP 探活。违反 standards.md §2 的文件体量上限（400 行），且关注点混杂导致修改一个方面时需要理解整个文件。

拆分目标：
- 每个子模块不超过 150 行，职责单一。
- 按关注点分离：进程生命周期（spawn/stop）、状态校正（reclaim）、文件系统辅助（lock/pidfile/log）、网络探活（probe）。

## What Changes

### 目录结构

```
src/
├── supervisor/
│   ├── index.ts       # 公共 API 导出（startInstance, stopInstance, reclaim, tailLog）
│   ├── spawn.ts       # startInstance + TCP 就绪探活循环
│   ├── stop.ts        # stopInstance + stopProcessGroup + waitPortFree
│   ├── reclaim.ts     # reclaim（启动时孤儿认领）
│   ├── lock.ts        # acquireLock / releaseLock / lockPath
│   ├── pidfile.ts     # writePidfile / clearPidfile / readPidfile
│   ├── log.ts         # tailLog / rotateLog / writeFailureSnapshot
│   └── probe.ts       # tcpConnectable / waitTcp / isAlive / groupAlive / procMatches
```

### 拆分原则

- `index.ts` 是唯一对外入口，re-export 公共 API。外部模块只 import from `./supervisor/index.ts`（或 `./supervisor.ts` 兼容路径）。
- 子模块之间允许互相引用（如 `spawn.ts` 使用 `lock.ts`、`pidfile.ts`、`probe.ts`）。
- `InstanceRecord` 类型定义保留在 `index.ts`（或提取到 `types.ts`）。

## Impact

- **破坏性**：无。纯内部重构。
- **影响范围**：`src/supervisor.ts` → `src/supervisor/` 目录
- **风险**：低。逻辑不变，只是文件移动。需要更新 import 路径。
- **依赖项**：无前置依赖，可独立执行。
