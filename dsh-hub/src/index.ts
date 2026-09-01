#!/usr/bin/env node
/**
 * DSH Hub · 控制面入口（M2.1：配置中心化 + 版本号外置）
 *
 * 跑 `pnpm run dev`（node --disable-warning=ExperimentalWarning src/index.ts，Node 24 原生跑 TS）。
 * 环境变量（集中定义于 src/config.ts）：
 *   DSH_HUB_DATA / DSH_HUB_HOST / DSH_HUB_PORT / DSH_HUB_COOKIE_SECURE / DSH_BIN /
 *   DSH_HUB_DOMAIN / DSH_HUB_TRUST_PROXY
 *
 * 里程碑挂载：M3 src/gateway（鉴权网关）、M4 src/admin（管理 UI）。
 */
import process from 'node:process';
import type http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.ts';
import { config } from './config.ts';
import { startServer } from './api.ts';
import { reclaim } from './supervisor/index.ts';
import { setGatewayDb } from './gateway.ts';
import { startScheduler, stopScheduler } from './scheduler.ts';

export { sanitizeNickname, generateSlug, shortId } from './users.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version?: string };

const BANNER = `DSH Hub · DeepSeek Harness 多租户多实例管理器
版本 ${pkg.version ?? '?'}（M2.1：安全修复 + 去屎山）  文档 ../docs/00-进展日志.md`;

function main(): void {
  console.log(BANNER);
  console.log(`数据根: ${config.dataDir}`);
  console.log(`注册开关默认 closed（管理员经 /admin/api/settings 打开）`);

  const db = openDb({ dataDir: config.dataDir });
  setGatewayDb(db);
  // 启动定时任务（会员到期检查）
  startScheduler(db);
  // 监督器重启后的孤儿实例认领：先校正 DB 状态再服务请求
  const fixed = reclaim(db);
  if (fixed.length > 0) console.log(`[reclaim] ${fixed.length} 个实例状态校正:`);
  for (const line of fixed) console.log(`  - ${line}`);
  const server: http.Server = startServer(db, { host: config.host, port: config.port });

  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    console.log('\n关闭中…');
    stopScheduler();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('listening', () => {
    const addr = server.address();
    const actual = typeof addr === 'object' && addr ? `${addr.address}:${addr.port}` : `${config.host}:${config.port}`;
    console.log(`控制面已就绪: http://${actual}`);
    console.log('端点速查: POST /api/auth/setup（首启向导） · /api/auth/login · GET /api/me · /api/instances（M2） · /admin/api/users · /healthz');
    console.log('M3 待办：鉴权网关 + WS 隧道（docs/02 里程碑表）。');
  });
}

main();
