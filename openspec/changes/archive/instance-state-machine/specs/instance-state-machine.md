# Spec: 实例状态机形式化

## Feature: 状态类型

### Scenario: 状态值限定
- GIVEN InstanceStatus 类型
- WHEN 赋值状态
- THEN 只允许 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'
- AND 其他值在编译期报错

## Feature: 状态转换校验

### Scenario: 合法转换通过
- GIVEN 实例状态为 'stopped'
- WHEN 转换到 'starting'
- THEN 转换成功

### Scenario: 非法转换拒绝
- GIVEN 实例状态为 'stopped'
- WHEN 尝试转换到 'running'（跳过 starting）
- THEN 抛出错误 `invalid transition: stopped → running`

### Scenario: 完整转换表
- GIVEN 状态转换表
- WHEN 查看允许的转换
- THEN stopped → [starting]
- AND starting → [running, failed, stopped]
- AND running → [stopping, failed]
- AND stopping → [stopped, failed]
- AND failed → [starting, stopped]

## Feature: 转换日志

### Scenario: 转换记录日志
- GIVEN 状态转换发生
- WHEN 转换执行
- THEN console 输出 `[state] <id>: <from> → <to>`
- AND 非法转换输出 `[state] REJECTED <id>: <from> → <to>`

## Feature: reclaim 兼容

### Scenario: reclaim 校正不受限制
- GIVEN 实例 DB 状态为 'starting' 但进程已死
- WHEN reclaim 执行
- THEN 允许转换到 'stopped'（在转换表中）
- AND 不受「必须从 starting 到 running」的限制
