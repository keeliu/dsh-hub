/**
 * DSH Hub · 端口分配器（M2）
 *
 * 范围约定：避开 3080/3081（主实例与现有 GUI），实例端口取 4000–4999。
 * 分配 = DB 记账（port UNIQUE）+ TCP 探活双保险（docs/02 §3.2）。
 */
import net from 'node:net';
import type { DatabaseSync } from 'node:sqlite';

export const PORT_MIN = 4000;
export const PORT_MAX = 4999;
const RESERVED = new Set([3080, 3081]);

function tcpFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.once('connect', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(true));
  });
}

/** 分配一个空闲实例端口：DB 未占用 + TCP 未监听。 */
export async function allocatePort(db: DatabaseSync): Promise<number> {
  const used = new Set(
    (db.prepare('SELECT port FROM instances WHERE port IS NOT NULL').all() as { port: number }[])
      .map((r) => r.port)
  );
  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    if (RESERVED.has(port) || used.has(port)) continue;
    if (await tcpFree(port)) return port;
  }
  throw new Error('no free port in range 4000-4999');
}