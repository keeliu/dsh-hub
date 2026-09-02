/**
 * DSH Hub · 配置中心（M2.1 拆分）
 *
 * 全部环境变量集中读取，消费方不再直接触碰 process.env（除本模块）。
 *   DSH_HUB_DATA         数据根（默认 <dsh-hub>/data；用户目录 users/ 也在此）
 *   DSH_HUB_HOST         监听地址（默认 127.0.0.1；公网一律走之后的 Caddy/网关）
 *   DSH_HUB_PORT         控制面端口（默认 3082；约定避开 3080/3081）
 *   DSH_HUB_COOKIE_SECURE=1  会话 cookie 加 Secure（在 Caddy TLS 后启用）
 *   DSH_BIN              dsh 二进制路径（缺省自动探测）
 *   DSH_HUB_DOMAIN       trusted-host 子域后缀（默认 dshhub.local）
 *   DSH_HUB_TRUST_PROXY=1   信任 X-Forwarded-For（仅当控制面只被可信反代访问）
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  cookieSecure: boolean;
  dshBin: string | null;
  hubDomain: string;
  trustProxy: boolean;
  /** 时间校正偏移（毫秒），用于修复服务器系统时间错误。正值表示服务器时间比实际快。 */
  timeOffsetMs: number;
}

const here = dirname(fileURLToPath(import.meta.url));

function loadConfig(): Config {
  return {
    host: process.env.DSH_HUB_HOST ?? '127.0.0.1',
    port: Number(process.env.DSH_HUB_PORT ?? 3082),
    dataDir: process.env.DSH_HUB_DATA ?? join(here, '..', 'data'),
    cookieSecure: process.env.DSH_HUB_COOKIE_SECURE === '1',
    dshBin: process.env.DSH_BIN ?? null,
    hubDomain: process.env.DSH_HUB_DOMAIN ?? 'dshhub.local',
    trustProxy: process.env.DSH_HUB_TRUST_PROXY === '1',
    // 时间校正：DSH_HUB_TIME_OFFSET_MS 为正表示服务器时间比实际快（需减去）
    // 服务器显示 2026 年但实际是 2025 年，差值约 31536000000ms（1 年）
    timeOffsetMs: Number(process.env.DSH_HUB_TIME_OFFSET_MS ?? 0),
  };
}

/** 进程级配置单例（每进程加载一次；测试通过独立进程覆盖 env）。 */
export const config: Config = loadConfig();

/**
 * 获取校正后的 Unix 时间戳（秒），专用于虎皮椒等外部 API。
 * 当服务器系统时间错误时，通过 DSH_HUB_TIME_OFFSET_MS 校正。
 * 正值 offset 表示服务器时间比实际快，需要减去。
 */
export function correctedUnixTime(): string {
  return Math.floor((Date.now() - config.timeOffsetMs) / 1000).toString();
}

/**
 * 格式化时间戳为北京时间字符串。
 * 服务器使用 UTC 时间戳，此函数转换为 Asia/Shanghai 时区显示。
 */
export function formatCorrectedTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
