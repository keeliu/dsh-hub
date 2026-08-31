import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';

const TCP_PROBE_TIMEOUT_MS = 500;

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function tcpConnectable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    const timer = setTimeout(() => { s.destroy(); resolve(false); }, TCP_PROBE_TIMEOUT_MS);
    s.once('connect', () => { clearTimeout(timer); s.destroy(); resolve(true); });
    s.once('error', () => { clearTimeout(timer); resolve(false); });
  });
}

export async function waitTcp(port: number, deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    if (await tcpConnectable(port)) return true;
    await sleep(500);
  }
  return false;
}

/** 进程是否活着（kill -0）。 */
export function isAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * 进程组是否存活（kill(-pgid, 0)）：只要组内任一进程存活即 true。
 * 比只查组长 pid 可靠（组长先死、子进程存活时仍能补杀）。
 */
export function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * 进程身份校验（B3）：确认 pid 对应的是我们的 dsh web 实例（cmdline 含 dsh 特征
 * 与 --port <port>）。pid 被 OS 复用时校验失败 → 视为死实例，绝不 kill/认领。
 */
export function procMatches(pid: number, port: number | null): boolean {
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
    if (!cmdline.includes('dsh') && !cmdline.includes('@deepseek-ai')) return false;
    if (port !== null && !cmdline.includes(`--port ${port}`)) return false;
    return true;
  } catch {
    return false;
  }
}
