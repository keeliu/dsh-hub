# 配置读取统一化

## Why

`db.ts`、`email.ts`、`paths.ts` 直接读取 `process.env.*`，违反 §4.2（除 `config.ts` 外任何模块不得直接访问 `process.env`）。这导致：
- 配置来源分散，难以追踪哪些模块依赖哪些环境变量
- 测试时无法统一 mock 配置
- 新增配置项时容易遗漏 `config.ts` 的同步更新

## What Changes

1. `config.ts` 新增 `getDataDir()`、`getSmtpConfig()` 等导出函数
2. `db.ts` 改为通过 `config` 获取 `dataDir`
3. `email.ts` 改为通过 `config` 获取 SMTP 配置
4. `paths.ts` 改为通过 `config` 获取 `dataDir`
5. `supervisor/spawn.ts` 改为通过 `config` 获取 `DSH_BIN`

## Impact

- **修改文件**：`src/config.ts`、`src/db.ts`、`src/email.ts`、`src/paths.ts`、`src/supervisor/spawn.ts`
- **不影响**：运行时行为、环境变量名称、部署配置
