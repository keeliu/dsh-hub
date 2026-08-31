# Tasks: Schema 迁移版本化

## 阶段 1：迁移框架

- [ ] 1.1 定义 `Migration` 接口
- [ ] 1.2 创建 `schema_version` 表
- [ ] 1.3 实现 `getSchemaVersion` / `setSchemaVersion`
- [ ] 1.4 实现 `migrate` 函数（版本化迁移执行）

## 阶段 2：迁移定义

- [ ] 2.1 定义 version 1 迁移（initial schema）
- [ ] 2.2 定义 version 2 迁移（add username）
- [ ] 2.3 定义 version 3 迁移（password_reset_codes）
- [ ] 2.4 实现旧数据库版本推断（`inferSchemaVersion`）

## 阶段 3：验证

- [ ] 3.1 类型检查通过
- [ ] 3.2 全新数据库：所有迁移执行，version 为最新
- [ ] 3.3 旧数据库：推断版本号，增量迁移执行
- [ ] 3.4 重复启动：无迁移执行，幂等
- [ ] 3.5 冒烟测试通过
- [ ] 3.6 归档变更

## 预估时间

- 阶段 1：1 小时
- 阶段 2：1 小时
- 阶段 3：30 分钟
- **总计：2.5 小时**
