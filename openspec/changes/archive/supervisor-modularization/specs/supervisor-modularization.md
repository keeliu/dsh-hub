# Spec: supervisor 模块拆分

## Feature: 模块结构

### Scenario: 按关注点拆分
- GIVEN `src/supervisor/` 目录存在
- WHEN 查看模块结构
- THEN `spawn.ts` 包含 `startInstance` 和启动逻辑
- AND `stop.ts` 包含 `stopInstance` 和停止逻辑
- AND `reclaim.ts` 包含 `reclaim` 孤儿认领逻辑
- AND `lock.ts` 包含锁管理函数
- AND `pidfile.ts` 包含 pidfile 管理函数
- AND `log.ts` 包含日志相关函数
- AND `probe.ts` 包含网络探活和进程检测函数

### Scenario: 公共 API 通过 index.ts 导出
- GIVEN 外部模块需要 supervisor 功能
- WHEN import
- THEN 从 `./supervisor/index.ts` 导入
- AND 不直接引用子模块（如 `./supervisor/spawn.ts`）

## Feature: 功能不变

### Scenario: startInstance 行为不变
- GIVEN 拆分完成
- WHEN 调用 `startInstance(db, record)`
- THEN 行为与拆分前完全一致（建目录 → 加锁 → spawn → 探活 → 更新 DB）

### Scenario: stopInstance 行为不变
- GIVEN 拆分完成
- WHEN 调用 `stopInstance(db, record)`
- THEN 行为与拆分前完全一致（TERM → 等待 → KILL → 确认端口释放）

### Scenario: reclaim 行为不变
- GIVEN 拆分完成
- WHEN 调用 `reclaim(db)`
- THEN 行为与拆分前完全一致（校正孤儿实例状态）

## Feature: 文件体量

### Scenario: 每个子模块不超过 150 行
- GIVEN 拆分完成
- WHEN 统计每个子模块行数
- THEN 所有文件 ≤ 150 行
