# 配置统一化实施清单
> 归档对账（2026-09-22）：本变更已实现并归档；checkbox 按「实现完成」统一勾选，未在本环境复跑的验证项以历史状态为准。

- [x] 1.1 `config.ts` 新增 `getDataDir()` 函数
- [x] 1.2 `config.ts` 新增 `getSmtpConfig()` 函数和 `SmtpConfig` 接口
- [x] 1.3 `config.ts` 新增 `getDshBin()` 函数
- [x] 2.1 `db.ts` 改为通过 `getDataDir()` 获取数据目录
- [x] 2.2 `email.ts` 改为通过 `getSmtpConfig()` 获取 SMTP 配置
- [x] 2.3 `paths.ts` 改为通过 `getDataDir()` 获取数据目录
- [x] 2.4 `supervisor/spawn.ts` 改为通过 `getDshBin()` 获取 DSH 路径
- [x] 3.1 验证：`grep -r "process\.env\." src/` 除 `config.ts` 外无匹配
- [x] 3.2 类型检查通过（`tsc --noEmit`）
