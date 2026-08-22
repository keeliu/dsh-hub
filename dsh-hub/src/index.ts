#!/usr/bin/env node
/**
 * DSH Hub · 控制面入口（M2：实例生命周期 + 昵称目录）
 *
 * 跑 `pnpm run dev`（node --disable-warning=ExperimentalWarning src/index.ts，Node 24 原生跑 TS）。
 * 环境变量：
 *   DSH_HUB_DATA         数据根（默认 <dsh-hub>/data；用户目录 users/ 也在此）
 *   DSH_HUB_HOST         监听地址（默认 127.0.0.1；公网一律走之后的 Caddy/网关，勿直接绑 0.0.0.0）
 *   DSH_HUB_PORT         控制面端口（默认 3082；约定避开 3080/3081）
 *   DSH_HUB_COOKIE_SECURE=1  会话 cookie 加 Secure（在 Caddy TLS 后启用）
 *   DSH_BIN              dsh 二进制路径（缺省自动探测）
 *   DSH_HUB_DOMAIN       trusted-host 子域后缀（默认 dshhub.local）
 *
 * 里程碑挂载：M3 src/gateway（鉴权网关）、M4 src/admin（管理 UI）。
 */
import process from 'node:process';
import type http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db.ts';
import { startServer } from './api.ts';
import { reclaim } from './supervisor.ts';

export { sanitizeNickname, generateSlug, shortId } from './users.ts';

const BANNER = `DSH Hub · DeepSeek Harness 多租户多实例管理器
版本 0.1.0（M2：实例生命周期 + 昵称目录）  文档 ../docs/00-进展日志.md`;

function main(): void {
  const host = process.env.DSH_HUB_HOST ?? '127.0.0.1';
  const port = Number(process.env.DSH_HUB_PORT ?? 3082);
  const dataDir = process.env.DSH_HUB_DATA ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

  console.log(BANNER);
  console.log(`数据根: ${dataDir}`);
  console.log(`注册开关默认 closed（管理员经 /admin/api/settings 打开）`);

  const db = openDb({ dataDir });
  // 监督器重启后的孤儿实例认领：先校正 DB 状态再服务请求
  const fixed = reclaim(db);
  if (fixed.length > 0) console.log(`[reclaim] ${fixed.length} 个实例状态校正:`);
  for (const line of fixed) console.log(`  - ${line}`);
  const server: http.Server = startServer(db, { host, port });

  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    console.log('\n关闭中…');
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
    const actual = typeof addr === 'object' && addr ? `${addr.address}:${addr.port}` : `${host}:${port}`;
    console.log(`控制面已就绪: http://${actual}`);
    console.log('端点速查: POST /api/auth/setup（首启向导） · /api/auth/login · GET /api/me · /api/instances（M2） · /admin/api/users · /healthz');
    console.log('M3 待办：鉴权网关 + WS 隧道（docs/02 里程碑表）。');
  });
}

main();