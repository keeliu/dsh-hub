# Design: supervisor 模块拆分

## 文件分配

### probe.ts（~60 行）

从当前 `supervisor.ts` 提取：
- `tcpConnectable(port)` — TCP 连接探活
- `waitTcp(port, deadline)` — 等待 TCP 就绪
- `isAlive(pid)` — 进程存活检测（kill -0）
- `groupAlive(pid)` — 进程组存活检测
- `procMatches(pid, port)` — 进程身份校验（/proc/pid/cmdline）
- `sleep(ms)` — 辅助

### lock.ts（~40 行）

- `lockPath(record)` — 锁文件路径
- `acquireLock(record)` — 原子获取锁（wx）
- `releaseLock(record, token?)` — 释放锁（校验所有权）

### pidfile.ts（~30 行）

- `instancePidfile(record)` — pidfile 路径
- `writePidfile(record, pid)` — 写入 pidfile
- `clearPidfile(record)` — 删除 pidfile
- `readPidfile(record)` — 读取 pidfile

### log.ts（~60 行）

- `instanceLogDir(record)` — 日志目录路径
- `rotateLog(logPath, maxBytes)` — 日志轮转
- `writeFailureSnapshot(record, title, detail)` — 失败快照
- `tailLog(record, tail)` — 日志尾部读取

### spawn.ts（~120 行）

- `startInstance(db, record)` — 启动实例主流程
- `ensureInstanceDirs(record)` — 目录创建
- `resolveDshBin()` — dsh 二进制探测
- 启动循环：加锁 → spawn → 探活 → 更新 DB

### stop.ts（~60 行）

- `stopInstance(db, record, opts?)` — 停止实例主流程
- `stopProcessGroup(pid, graceMs)` — 进程组终止（TERM → 等待 → KILL）
- `waitPortFree(port, timeoutMs)` — 等待端口释放

### reclaim.ts（~30 行）

- `reclaim(db)` — 启动时孤儿认领

### index.ts（~30 行）

- re-export 公共 API：`startInstance`、`stopInstance`、`reclaim`、`tailLog`
- 定义并导出 `InstanceRecord` 类型
- 导出常量：`START_TIMEOUT_MS`、`STOP_GRACE_MS` 等

## 兼容性

外部模块当前 import from `'./supervisor.ts'`。拆分后：
- 方案 A：保留 `supervisor.ts` 作为 re-export 入口（`export * from './supervisor/index.ts'`）。外部模块无需修改 import 路径。
- 方案 B（选定）：直接删除 `supervisor.ts`，外部模块改为 import from `'./supervisor/index.ts'`。更显式，但需要更新 import 路径。

选定方案 B，因为：
- 显式优于隐式。
- import 路径变更只涉及 `api.ts`、`pages.ts`、`instances.ts`、`index.ts` 四个文件。

## 不变更的部分

- 所有公共函数的签名和行为不变。
- 常量值不变。
- `InstanceRecord` 类型定义不变。
