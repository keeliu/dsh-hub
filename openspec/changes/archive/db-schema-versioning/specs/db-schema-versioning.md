# Spec: Schema 迁移版本化

## Feature: 版本追踪

### Scenario: 新建数据库初始化版本
- GIVEN 全新的数据库文件
- WHEN `migrate(db)` 执行
- THEN 所有迁移按顺序执行
- AND `schema_version` 表记录最终版本号

### Scenario: 已有数据库增量迁移
- GIVEN 数据库 `schema_version` = 3
- WHEN 代码包含 version 4 和 5 的迁移
- THEN 只执行 version 4 和 5 的迁移
- AND `schema_version` 更新为 5

### Scenario: 重复执行幂等
- GIVEN 数据库已是最新版本
- WHEN `migrate(db)` 再次执行
- THEN 无迁移被执行
- AND 数据库状态不变

## Feature: 迁移定义

### Scenario: 迁移按版本号顺序执行
- GIVEN MIGRATIONS 数组包含 version 1, 2, 3
- WHEN 迁移执行
- THEN 按 version 升序依次执行

### Scenario: 迁移失败回滚
- GIVEN 迁移 version N 执行中抛出异常
- WHEN 迁移失败
- THEN version N 的变更被回滚（事务）
- AND `schema_version` 保持为 N-1
- AND 后续迁移不执行

## Feature: 向后兼容

### Scenario: 旧数据库自动迁移
- GIVEN 使用旧版 `migrate()` 创建的数据库（无 `schema_version` 表）
- WHEN 新版代码启动
- THEN 自动创建 `schema_version` 表
- AND 推断当前版本号（根据已存在的表和列）
- AND 执行后续增量迁移
