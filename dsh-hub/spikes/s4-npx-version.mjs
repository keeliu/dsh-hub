#!/usr/bin/env node
// S4 —— npx 固定版本冷启动可行性探测
// 目的（调研 §5.4）：无全局 dsh 的干净环境下 `npx @deepseek-ai/dsh@<ver>` 冷启动耗时与缓存行为。
// 做法：
//   - 用独立 npm 缓存（npm_config_cache 指向临时目录），不污染真实 ~/.npm
//   - 第一轮冷启动（必须从 registry 拉包），第二轮热启动（复用缓存）
//   - 对外网不可达的环境优雅降级（registry 探活失败 → 记 OFFLINE）
// 结论打印为 [S4][PASS]/[S4][FAIL]/[S4][INFO] 行，退出码 0/1。
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const VER = process.env.S4_DSH_VERSION || '0.1.1-rc.2';
const TIMEOUT_MS = Number(process.env.S4_TIMEOUT_MS || 120_000);
const HOST = process.env.S4_NPM_REGISTRY || 'https://registry.npmjs.org';

const results = [];
const record = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`[S4][${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};

function resolveNpx() {
  // 从 PATH 找 npx，解析到真实 npm 的 npx-cli.js 入口
  const which = spawnSync('which', ['npx'], { encoding: 'utf8' });
  const bin = which.stdout.trim();
  if (!bin) return null;
  const real = (() => {
    try { return readlinkSync(bin); } catch { return bin; }
  })();
  if (!real.startsWith('/')) {
    // 相对符号链接：相对 npx 所在目录
    return join(dirname(bin), real);
  }
  return real;
}

// npx cli 入口是 npm 的 bin/npx-cli.js（脚本首行可执行，node 可直接跑）
const npxCli = resolveNpx();

function probeRegistry() {
  return new Promise((resolve) => {
    const u = new URL(HOST);
    const req = (u.protocol === 'https:' ? import('node:https') : import('node:http')).then((m) => {
      const r = m.default.get({ host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname, timeout: 8000 }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      r.on('timeout', () => { r.destroy(); resolve(false); });
      r.on('error', () => resolve(false));
    }).catch(() => resolve(false));
  });
}

function runNpx(cacheDir, args, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [npxCli, '--yes', `@deepseek-ai/dsh@${VER}`, ...args], {
      env: { ...process.env, npm_config_cache: cacheDir, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve({ ok: false, timeMs: Date.now() - t0, code: 'timeout', out, err });
    }, timeoutMs);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, timeMs: Date.now() - t0, code, out, err });
    });
  });
}

// ================= 主流程 =================
const home = mkdtempSync(join(tmpdir(), 'dshhub-s4-'));
const cache = join(home, 'npm-cache');

try {
  console.log(`[S4] target=@deepseek-ai/dsh@${VER}; registry=${HOST}; timeout=${TIMEOUT_MS}ms; cache=${cache}`);
  const online = await probeRegistry();
  record('registry 可达性探测', online, online ? `${HOST} 可达` : `${HOST} 不可达（预期 OFFLINE，仅记录结论）`);
  if (!online) {
    record('外网可达（registry 探活）', false, '预期 OFFLINE，S4 只记录不可达结论');
    // 仍尝试一次：若全局/缓存里已有该包，可能离线也可用
    const retry = await runNpx(cache, ['--version'], 20_000);
    if (retry.ok) record('离线冷启动（缓存命中）', true, `${retry.timeMs}ms`);
    else record('离线冷启动', false, retry.code === 'timeout' ? '超时' : `exit=${retry.code}`);
  } else {
    const cold = await runNpx(cache, ['--version'], TIMEOUT_MS);
    record('冷启动 npx 拉包并出版本号', cold.ok, `${cold.timeMs}ms${cold.ok ? '' : ' — ' + (cold.err || cold.out).slice(0, 200)}`);
    if (cold.ok) {
      const verLine = (cold.out + cold.err).split('\n').find((l) => l.includes('0.1') || /rc/.test(l)) || cold.out.trim();
      record('版本号输出可解析', verLine.length > 0, verLine.slice(0, 80));
    }
    const warm = await runNpx(cache, ['--version'], TIMEOUT_MS);
    record('热启动（复用缓存）', warm.ok, `${warm.timeMs}ms`);
    if (cold.ok && warm.ok) {
      const ratio = (warm.timeMs / Math.max(1, cold.timeMs)).toFixed(2);
      record('缓存行为：热启动明显快于冷启动', Number(ratio) < 0.6, `cold=${cold.timeMs}ms warm=${warm.timeMs}ms ratio=${ratio}`);
    }
  }
} catch (e) {
  record('主流程', false, String(e.message ?? e));
} finally {
  rmSync(home, { recursive: true, force: true });
}

const pass = results.every(Boolean);
console.log(pass ? '[S4] ===== 总结：全部通过 =====' : `[S4] ===== 总结：${results.filter((r) => !r).length} 项失败 =====`);
process.exit(pass ? 0 : 1);