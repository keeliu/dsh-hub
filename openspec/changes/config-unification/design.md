# 配置统一化技术方案

## 改动明细

### config.ts 新增

```typescript
export function getDataDir(): string {
  return process.env.DSH_HUB_DATA ?? './data';
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
    secure: process.env.SMTP_SECURE === 'true',
  };
}
```

### db.ts 改动

```typescript
// 改前
const dataDir = opts.dataDir ?? process.env.DSH_HUB_DATA ?? './data';

// 改后
import { getDataDir } from './config.ts';
const dataDir = opts.dataDir ?? getDataDir();
```

### email.ts 改动

```typescript
// 改前：直接读 process.env.SMTP_*
// 改后：
import { getSmtpConfig } from './config.ts';
const smtp = getSmtpConfig();
if (!smtp) { /* 返回错误 */ }
```

### paths.ts 改动

```typescript
// 改前
const dataDir = process.env.DSH_HUB_DATA ?? './data';

// 改后
import { getDataDir } from './config.ts';
const dataDir = getDataDir();
```

### supervisor/spawn.ts 改动

```typescript
// 改前
const dshBin = process.env.DSH_BIN ?? 'dsh';

// 改后
import { getDshBin } from '../config.ts';
const dshBin = getDshBin();
```

## 风险

- `config.ts` 的导入顺序：`config.ts` 不依赖其他业务模块，只读 `process.env`，不存在循环依赖风险。
- 默认值保持一致：各函数的默认值必须与原 `process.env.X ?? default` 完全相同。
