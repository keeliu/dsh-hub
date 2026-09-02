# 配置统一化实施清单

- [ ] 1.1 `config.ts` 新增 `getDataDir()` 函数
- [ ] 1.2 `config.ts` 新增 `getSmtpConfig()` 函数和 `SmtpConfig` 接口
- [ ] 1.3 `config.ts` 新增 `getDshBin()` 函数
- [ ] 2.1 `db.ts` 改为通过 `getDataDir()` 获取数据目录
- [ ] 2.2 `email.ts` 改为通过 `getSmtpConfig()` 获取 SMTP 配置
- [ ] 2.3 `paths.ts` 改为通过 `getDataDir()` 获取数据目录
- [ ] 2.4 `supervisor/spawn.ts` 改为通过 `getDshBin()` 获取 DSH 路径
- [ ] 3.1 验证：`grep -r "process\.env\." src/` 除 `config.ts` 外无匹配
- [ ] 3.2 类型检查通过（`tsc --noEmit`）
