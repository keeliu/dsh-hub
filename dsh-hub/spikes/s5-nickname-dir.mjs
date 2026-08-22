#!/usr/bin/env node
// S5 —— 中文昵称作目录名在 ext4 的实际表现
// 目的（调研 §5.5）：确定昵称→目录名的净化规则（剔除 /、控制字符、首尾空白、前导 .、
// 截断 ≤64 字节、空结果回退 user-<id8>）并验证中文名在 ext4 的 roundtrip / 改名 / 备份兼容。
// 测试根：spikes/.artifacts/s5（在项目盘 ext4 上，gitignore 已排除）。
// 结论打印为 [S5][PASS]/[S5][FAIL] 行，退出码 0/1。
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, renameSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '.artifacts', 's5');
const results = [];
const record = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`[S5][${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};

// ---- 净化规则原型函数（与开发计划 §3.1 一致）----
function sanitizeNickname(nickname, id8) {
  let s = String(nickname ?? '');
  // 剔除控制字符与路径分隔符与斜杠
  s = s.replace(/[/\x00-\x1f\x7f]/g, '');
  // 剔除首尾空白
  s = s.trim();
  // 剔除前导 .（防隐藏目录/..）
  s = s.replace(/^\.+/, '');
  if (s === '') return `user-${id8}`;
  // 按 UTF-8 字节截断 ≤64 字节（避免截断多字节字符产生半个字符）
  let buf = Buffer.from(s, 'utf8');
  if (buf.byteLength <= 64) return s;
  for (let cut = 64; cut > 0; cut--) {
    const sub = buf.subarray(0, cut).toString('utf8');
    if (Buffer.byteLength(sub) <= 64 && !sub.endsWith('\uFFFD')) { // 不以替换符结尾 => 未劈开字符
      return sub;
    }
  }
  return s.slice(0, 1);
}

function nextCollisionFree(base, existing) {
  let cand = base;
  let i = 2;
  while (existing.has(cand)) { cand = `${base}-${i}`; i++; }
  return cand;
}

// ---- 清理并重建测试根 ----
rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });

try {
  // 1) 纯中文昵称 roundtrip
  const zh = '张三';
  const zhDir = join(ROOT, zh);
  mkdirSync(zhDir, { recursive: true });
  writeFileSync(join(zhDir, 'note.txt'), '中文目录测试', 'utf8');
  const zhStat = statSync(zhDir);
  record('中文昵称直接作目录名（ext4 mkdir+读写）', existsSync(zhDir) && zhStat.isDirectory());
  record('UTF-8 字节长度可解析', String(Buffer.byteLength(zh)) === '6', `${zh} => ${Buffer.byteLength(zh)} 字节（'张'/'三' 各 3 字节）`);

  // 2) 净化规则断言
  const cases = [
    ['  ' + zh + '  ', '张三', '首尾空白剔除'],
    ['/etc/passwd', 'etcpasswd', '斜杠剔除（不做路径穿越）'],
    ['..hidden', 'hidden', '前导 . 剔除（防隐藏/上级）'],
    ['a\u0000b', 'ab', '控制字符剔除'],
    ['\u0001', 'user-00000001', '空结果回退 user-<id8>'],
    ['名'.repeat(40), null, '超 64 字节截断'],
  ];
  for (const [input, expected, label] of cases) {
    const got = sanitizeNickname(input, '00000001');
    if (expected === null) {
      record(`净化规则: ${label}`, Buffer.byteLength(got) <= 64 && got.length > 0 && !got.includes('\uFFFD'), `输入 ${input.length} 字符 → '${got}' (${Buffer.byteLength(got)}B)`);
    } else {
      record(`净化规则: ${label}`, got === expected, `'${input}' → '${got}'（期望 '${expected}'）`);
    }
  }

  // 3) 冲突处理 -2 -3
  const existing = new Set(['李四']);
  const c1 = nextCollisionFree('李四', existing); existing.add(c1);
  const c2 = nextCollisionFree('李四', existing); existing.add(c2);
  record('目录名冲突追加 -2/-3', c1 === '李四-2' && c2 === '李四-3', `${c1} / ${c2}`);

  // 4) 改名（昵称迁移）与备份工具兼容
  const oldDir = join(ROOT, zh);
  const newDir = join(ROOT, '张三·改名');
  renameSync(oldDir, newDir);
  record('rename() 支持中文目录改名', existsSync(newDir) && readFileSync(join(newDir, 'note.txt'), 'utf8') === '中文目录测试');

  // 备份兼容：tar 打包 + 解到别处，中文目录名保持
  const tarDest = join(ROOT, 'backup.tar');
  const { spawnSync } = await import('node:child_process');
  const tar = spawnSync('tar', ['-cf', tarDest, '-C', ROOT, '张三·改名'], { encoding: 'utf8' });
  const restore = join(ROOT, 'restored');
  mkdirSync(restore, { recursive: true });
  const untar = spawnSync('tar', ['-xf', tarDest, '-C', restore], { encoding: 'utf8' });
  record('tar 备份/还原保留中文目录名', tar.status === 0 && untar.status === 0 && existsSync(join(restore, '张三·改名', 'note.txt')), tar.status === 0 ? '' : `tar exit=${tar.status ?? tar.error?.code}`);

  // 5) 目录列表 roundtrip 完整性
  const listing = readdirSync(restore);
  record('readdir 中文名可枚举、无乱码', listing.includes('张三·改名'), `entries=${listing.join(',')}`);

  // 6) 一次多实例目录布局（计划 §3.1 结构）是否可建
  const inst = join(ROOT, 'instances', 'i-9f3k2a');
  for (const sub of ['home', 'workspace', 'logs']) mkdirSync(join(inst, sub), { recursive: true });
  record('“用户目录/instances/<id>/{home,workspace,logs}”布局可建', existsSync(join(inst, 'workspace')) && existsSync(join(inst, 'logs')));
} catch (e) {
  record('主流程', false, String(e.message ?? e));
} finally {
  // 保留 restored/ 等产物供人工抽查，仅清掉临时 tar
  try { rmSync(join(ROOT, 'backup.tar'), { force: true }); } catch {}
}

const pass = results.every(Boolean);
console.log(pass ? '[S5] ===== 总结：全部通过 =====' : `[S5] ===== 总结：${results.filter((r) => !r).length} 项失败 =====`);
console.log(`[S5] 产物保留于 ${ROOT}（已 gitignore，可抽查）`);
process.exit(pass ? 0 : 1);