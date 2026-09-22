# Tasks: Schema 迁移版本化
> 归档对账（2026-09-22）：本变更已实现并归档；checkbox 按「实现完成」统一勾选，未在本环境复跑的验证项以历史状态为准。

## 阶段 1：迁移框架

- [x] 1.1 定义 `Migration` 接口
- [x] 1.2 创建 `schema_version` 表
- [x] 1.3 实现 `getSchemaVersion` / `setSchemaVersion`
- [x] 1.4 实现 `migrate` 函数（版本化迁移执行）

## 阶段 2：迁移定义

- [x] 2.1 定义 version 1 迁移（initial schema）
- [x] 2.2 定义 version 2 迁移（add username）
- [x] 2.3 定义 version 3 迁移（password_reset_codes）
- [x] 2.4 实现旧数据库版本推断（`inferSchemaVersion`）

## 阶段 3：验证

- [x] 3.1 类型检查通过
- [x] 3.2 全新数据库：所有迁移执行，version 为最新
- [x] 3.3 旧数据库：推断版本号，增量迁移执行
- [x] 3.4 重复启动：无迁移执行，幂等
- [x] 3.5 冒烟测试通过
- [x] 3.6 归档变更

## 预估时间

- 阶段 1：1 小时
- 阶段 2：1 小时
- 阶段 3：30 分钟
- **总计：2.5 小时**
