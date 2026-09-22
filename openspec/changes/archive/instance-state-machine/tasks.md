# Tasks: 实例状态机形式化
> 归档对账（2026-09-22）：本变更已实现并归档；checkbox 按「实现完成」统一勾选，未在本环境复跑的验证项以历史状态为准。

## 前置条件

- [x] `supervisor-modularization` 已完成（supervisor 已拆分为子模块）

## 阶段 1：类型与转换表

- [x] 1.1 定义 `InstanceStatus` 类型
- [x] 1.2 定义 `VALID_TRANSITIONS` 常量
- [x] 1.3 实现 `transitionStatus(db, id, to)` 函数
- [x] 1.4 `InstanceRecord.status` 类型从 `string` 收窄为 `InstanceStatus`

## 阶段 2：替换散落的状态转换

- [x] 2.1 `spawn.ts` 中的状态转换改用 `transitionStatus`
- [x] 2.2 `stop.ts` 中的状态转换改用 `transitionStatus`
- [x] 2.3 `reclaim.ts` 中的状态转换改用 `transitionStatus`
- [x] 2.4 处理 `startInstance` 开头的 stale 状态校正（特殊重置，不走 transitionStatus）

## 阶段 3：验证

- [x] 3.1 类型检查通过
- [x] 3.2 冒烟测试通过
- [x] 3.3 验证所有合法转换正常执行
- [x] 3.4 验证非法转换被拒绝（添加单元测试）
- [x] 3.5 归档变更

## 预估时间

- 阶段 1：1 小时
- 阶段 2：1.5 小时
- 阶段 3：1 小时
- **总计：3.5 小时**
