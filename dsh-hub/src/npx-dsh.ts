/**
 * 给 `npx @deepseek-ai/dsh@<版本>` 下载的那份 dsh 打客户端补丁。
 *
 * 背景：镜像启动时只对**内置**的 dsh（/usr/local/lib/node_modules）执行
 * `scripts/patch-dsh-client.sh`。实例指定非内置版本时，dsh 由 npx 下载到
 * `~/.npm/_npx/<hash>/node_modules/@deepseek-ai/dsh`，那是一份**原始包**：
 *   - client.js 没有 loopback 补丁 → 网关访问实例设置页失败；
 *   - index.js 没有浏览器鉴权旁路 → 网关服务器端 fetch 拿不到 cookie，
 *     实例首页返回 401 `dsh web authentication required; reopen the URL printed by dsh web.`
 * 现象是「实例状态 running，但工作区页面打不开」，实测 dsh@0.2.0-rc.1。
 * 因此在启动前按版本把 npx 缓存里的副本补一遍（幂等；补丁逻辑仍只有 shell 脚本一处实现）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** npm 缓存目录（实例进程继承 hub 的 HOME，故取同一个）。 */
export function npmCacheDir(): string {
  return process.env.NPM_CONFIG_CACHE || join(process.env.HOME || homedir(), '.npm');
}

/** 缓存里所有 `@deepseek-ai/dsh` 版本等于 `target` 的 node_modules 根目录。 */
export function npxDshRoots(target: string): string[] {
  const base = join(npmCacheDir(), '_npx');
  let entries: string[];
  try {
    entries = readdirSync(base);
  } catch {
    return [];
  }
  const roots: string[] = [];
  for (const entry of entries) {
    const nodeModules = join(base, entry, 'node_modules');
    const pkg = join(nodeModules, '@deepseek-ai', 'dsh', 'package.json');
    if (!existsSync(pkg)) continue;
    try {
      const parsed = JSON.parse(readFileSync(pkg, 'utf8')) as { version?: unknown };
      if (parsed.version === target) roots.push(nodeModules);
    } catch {
      /* 读不动就跳过这一份 */
    }
  }
  return roots;
}

/** 补丁脚本位置：镜像里在 /usr/local/bin，本地开发机在仓库 dsh-hub/scripts/。 */
function patchScriptPath(): string | null {
  const installed = '/usr/local/bin/patch-dsh-client.sh';
  if (existsSync(installed)) return installed;
  const local = join(import.meta.dirname, '..', 'scripts', 'patch-dsh-client.sh');
  return existsSync(local) ? local : null;
}

/**
 * 按版本给 npx 缓存里的 dsh 打客户端补丁。
 *
 * 找不到脚本或补丁失败都**不阻塞启动**（实例照旧拉起，最坏结果是首页 401），
 * 只打 warn 便于排查。
 *
 * @returns 实际打过补丁的 root 数
 */
export function patchNpxDsh(version: string | null): number {
  if (!version) return 0;
  const roots = npxDshRoots(version);
  if (roots.length === 0) {
    console.warn(`[patch] npx 缓存里暂无 dsh@${version}（可能是首次启动、由 npx 现下载）→ 这份副本不会带客户端补丁`);
    return 0;
  }
  const script = patchScriptPath();
  if (!script) {
    console.warn(`[patch] 未找到 patch-dsh-client.sh，跳过 dsh@${version} 的客户端补丁`);
    return 0;
  }
  let patched = 0;
  for (const root of roots) {
    try {
      const out = execFileSync('sh', [script, root], { encoding: 'utf8', timeout: 60_000 });
      console.log(`[patch] dsh@${version} 客户端补丁（${root}）：\n${out.trim()}`);
      patched += 1;
    } catch (err) {
      console.warn(`[patch] dsh@${version} 客户端补丁失败（${root}）: ${String(err)}`);
    }
  }
  return patched;
}
