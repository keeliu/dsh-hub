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
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';

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

/**
 * 读取镜像内置 dsh 的版本号（取自 dsh 包自己的 package.json）。
 *
 * 这是「实例插件树必须与之一致」的基准版本：内置版本的 profile 才会与模板
 * `/opt/dsh-home-template` 同源；换成别的版本必须重装插件树，否则
 * dsh-base 找不到与自身同版的 dsh-sandbox-local 等依赖（生产实测启动失败）。
 * `DSH_BIN` 通常是 `/usr/local/bin/dsh` 软链，必须先 realpath 才能定位 package.json。
 */
export function getBuiltinDshVersion(): string | null {
  const bin = getDshBin();
  if (!bin) return null;
  let real = bin;
  try {
    real = realpathSync(bin);
  } catch {
    /* 软链不可解析时按原路径尝试 */
  }
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(dirname(real)), 'package.json'), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : null;
  } catch {
    return null;
  }
}

/** 某实例应当使用的 dsh 命令（装插件与启动必须用同一份）。 */
export interface DshCommand {
  /** 要 spawn 的可执行文件 */
  bin: string;
  /** argv 前缀，插件子命令 / web 启动参数都接在其后 */
  argvPrefix: string[];
  /** 实际使用的 dsh 版本；null = 未能判定（按内置/未知处理） */
  version: string | null;
}

/**
 * 解析实例的 dsh 命令：**插件树与运行进程必须来自同一个 dsh 版本**。
 *
 *   - 未指定版本，或指定版本 === 内置版本 → 直接用镜像内置 dsh（与模板同源，且省一次 npx 下载）
 *   - 其他版本 → `npx --yes @deepseek-ai/dsh@<version>`
 *
 * 反例（本函数修的缺陷）：插件用内置 0.1.5-rc.2 装，进程用 npx 0.2.0-rc.2 启动 →
 * `plugin tree failed to load: @deepseek-ai/dsh-sandbox-local`。
 */
export function resolveDshCommand(harnessVersion?: string | null): DshCommand {
  const requested = typeof harnessVersion === 'string' ? harnessVersion.trim() : '';
  const builtin = getBuiltinDshVersion();
  const bin = getDshBin();
  if (!requested || (builtin !== null && requested === builtin)) {
    // 内置二进制经 node 执行（bin.js 未必有可执行位）
    if (bin) return { bin: process.execPath, argvPrefix: [bin], version: builtin };
    return { bin: 'dsh', argvPrefix: [], version: builtin };
  }
  const npx = join(dirname(process.execPath), 'npx');
  return { bin: process.execPath, argvPrefix: [npx, '--yes', `@deepseek-ai/dsh@${requested}`], version: requested };
}

/** 获取预置插件模板目录（Docker 构建期产出），默认 /opt/dsh-home-template。 */
export function getTemplateDshHome(): string {
  return process.env.TEMPLATE_DSH_HOME ?? '/opt/dsh-home-template';
}

/** 获取会员到期检查间隔（毫秒），默认 1 小时 */
export function getExpiryCheckInterval(): number {
  return Number(process.env.DSH_HUB_EXPIRY_CHECK_INTERVAL ?? 3600000);
}

/**
 * 确保某实例/模板 profile 的 pnpm-workspace.yaml 已批准给定包名的构建脚本。
 *
 * pnpm v10+/11 默认不执行依赖生命周期脚本（原生模块如 node-pty 需 node-gyp 编译），
 * 必须显式 allowBuilds，否则 `dsh plugin --profile web add` 装这些包时会因构建被忽略而失败。
 * 写为 `allowBuilds:\n  <pkg>: true`（pnpm 11 认可，按包名匹配、与版本无关）。
 * 包名列表由 `presets.ts::activeAllowBuilds(db)` 动态提供。
 */
export function ensureProfileAllowBuilds(homePath: string, packages: readonly string[]): void {
  if (packages.length === 0) return;
  const profileDir = join(homePath, 'profiles', 'web');
  mkdirSync(profileDir, { recursive: true });
  const wsPath = join(profileDir, 'pnpm-workspace.yaml');
  const block = `${packages.map((p) => `  ${p}: true`).join('\n')}\n`;
  const hay = `allowBuilds:\n${block}`;
  if (existsSync(wsPath)) {
    const cur = readFileSync(wsPath, 'utf8');
    if (cur.includes('allowBuilds')) return; // 已配置，不重复
    writeFileSync(wsPath, cur.replace(/\s*$/, '\n') + hay);
  } else {
    writeFileSync(wsPath, hay);
  }
}
