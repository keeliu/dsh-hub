# 配置读取统一化规范

## 约束

除 `config.ts` 外，任何模块不得直接访问 `process.env`。所有配置通过 `config` 单例的导出函数获取。

## 配置函数清单

`config.ts` 必须导出以下函数，覆盖所有环境变量：

| 函数 | 环境变量 | 默认值 | 使用方 |
|---|---|---|---|
| `getDataDir()` | `DSH_HUB_DATA` | `'./data'` | `db.ts`、`paths.ts` |
| `getHost()` | `DSH_HUB_HOST` | `'127.0.0.1'` | `index.ts` |
| `getPort()` | `DSH_HUB_PORT` | `3082` | `index.ts` |
| `isCookieSecure()` | `DSH_HUB_COOKIE_SECURE` | `false` | `sessions.ts` |
| `getDshBin()` | `DSH_BIN` | `'dsh'` | `supervisor/spawn.ts` |
| `getDomain()` | `DSH_HUB_DOMAIN` | `''` | `subdomain.ts` |
| `isTrustProxy()` | `DSH_HUB_TRUST_PROXY` | `false` | `auth.ts` |
| `getSmtpConfig()` | `SMTP_HOST/PORT/USER/PASS/FROM/SECURE` | `null` | `email.ts` |

## 验证条件

Given 代码库中所有 `.ts` 文件

When 执行 `grep -r "process\.env\." src/ --include="*.ts"`

Then 除 `config.ts` 外，不应有任何匹配结果。
