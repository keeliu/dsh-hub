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
 *   SMTP_HOST/PORT/USER/PASS/FROM/SECURE  邮件发送配置
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  cookieSecure: boolean;
  dshBin: string | null;
  hubDomain: string;
  trustProxy: boolean;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

/**
 * 实例创建时预置的默认插件（单一真相源，instances.ts / spawn.ts 均从此导入）。
 * 全部走 npm registry（已实测可解析）。原 2 个 `github:` 源（dsh-better-sidebar、
 * dsh-cost-meter）在镜像内构建失败（git-dep prepare 被 pnpm 拦截 / ref 不可解析），
 * 已替换为对应 npm 包，避免"模板装不全 + 复制不校验"导致的实例缺插件问题。
 */
export const DEFAULT_PLUGINS = [
  'dshmarket',
  'dsh-better-sidebar',
  '@xmanrui/dsh-im',
  'dsh-cost-meter',
  'dsh-visualize',
] as const;

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
  };
}

/** 进程级配置单例（每进程加载一次；测试通过独立进程覆盖 env）。 */
export const config: Config = loadConfig();

/** 获取数据根目录 */
export function getDataDir(): string {
  return config.dataDir;
}

/** 获取 SMTP 配置（未配置时返回 null） */
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

/** 获取 DSH 二进制路径 */
export function getDshBin(): string | null {
  const fromEnv = process.env.DSH_BIN;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const guess = join(dirname(process.execPath), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (existsSync(guess)) return guess;
  return null;
}

/** 获取预置插件模板目录（Docker 构建期产出），默认 /opt/dsh-home-template。 */
export function getTemplateDshHome(): string {
  return process.env.TEMPLATE_DSH_HOME ?? '/opt/dsh-home-template';
}

/** 获取会员到期检查间隔（毫秒），默认 1 小时 */
export function getExpiryCheckInterval(): number {
  return Number(process.env.DSH_HUB_EXPIRY_CHECK_INTERVAL ?? 3600000);
}
