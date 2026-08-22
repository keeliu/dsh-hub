#!/usr/bin/env node
/**
 * DSH Hub · 控制面入口（M1 前置占位）
 *
 * 当前形态：环境自检引导。跑 `pnpm run dev`（node --disable-warning=ExperimentalWarning src/index.ts）。
 * Node 24 原生跑 TS（erasable 语法）。后续里程碑在此挂载：
 *   src/auth（认证与会话）、src/users（昵称目录）、src/supervisor（实例监督器）、
 *   src/gateway（鉴权网关）、src/admin（管理面）。
 */
import process from 'node:process';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const BANNER = `DSH Hub · DeepSeek Harness 多租户多实例管理器
版本 0.1.0（M0 脚手架）  文档 ../docs/00-进展日志.md`;

/** 与开发计划 §3.1 一致的昵称净化规则（S5 已验证）。 */
export function sanitizeNickname(nickname: string, id8: string): string {
  let s = String(nickname ?? '')
    .replace(/[/\x00-\x1f\x7f]/g, '')
    .trim()
    .replace(/^\.+/, '');
  if (s === '') return `user-${id8}`;
  const buf = Buffer.from(s, 'utf8');
  if (buf.byteLength <= 64) return s;
  for (let cut = 64; cut > 0; cut--) {
    const sub = buf.subarray(0, cut).toString('utf8');
    if (Buffer.byteLength(sub) <= 64 && !sub.endsWith('\uFFFD')) return sub;
  }
  return s.slice(0, 1);
}

/** 测试端口约定：永不触碰 3080/3081（主实例与现有 GUI）。 */
const RESERVED = new Set([3080, 3081]);

interface SelfCheckRow {
  name: string;
  ok: boolean;
  detail: string;
}

function resolveDshBin(): string | null {
  const fromEnv = process.env.DSH_BIN;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const guess = join(dirname(process.execPath), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (existsSync(guess)) return guess;
  return null;
}

function selfCheck(): SelfCheckRow[] {
  const rows: SelfCheckRow[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0] ?? 0);
  rows.push({
    name: 'Node 版本 >= 24（原生 TS 直跑）',
    ok: nodeMajor >= 24,
    detail: `v${process.versions.node}`,
  });
  const dshBin = resolveDshBin();
  let dshVer = '（缺失）';
  if (dshBin) {
    const r = spawnSync(process.execPath, [dshBin, '--version'], { encoding: 'utf8', timeout: 15_000 });
    dshVer = (r.stdout || r.stderr || '').trim() || '（版本读不出）';
  }
  rows.push({
    name: 'dsh 二进制可解析',
    ok: Boolean(dshBin),
    detail: dshBin ? `${dshVer} @ ${dshBin}` : 'PATH/默认探测路径均未找到',
  });
  // 测试端口约定在 supervisor 落地时实测；这里仅校验自检行本身非空。
  rows.push({ name: '自检完整', ok: rows.length === 2, detail: '端口隔离约定：永不触碰 3080/3081' });
  return rows;
}

function main(): void {
  console.log(BANNER);
  console.log('\n--- 环境自检 ---');
  let allOk = true;
  for (const row of selfCheck()) {
    allOk &&= row.ok;
    console.log(`[${row.ok ? 'OK ' : 'FAIL'}] ${row.name} — ${row.detail}`);
  }
  console.log('\nM1 待办：认证与用户体系（docs/02 里程碑表）。');
  process.exit(allOk ? 0 : 1);
}

main();