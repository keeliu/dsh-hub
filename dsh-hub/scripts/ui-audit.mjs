#!/usr/bin/env node
/**
 * UI 静态自查（阶段 0 标尺）
 *
 * 规则集对应 openspec/changes/ui-design-system/tasks.md 0.1 / 1.3：
 *   ① 颜色字面量（除 views/styles/tokens.ts 外）
 *   ② 未定义 var(--x)                       ← P0 已归零，后续不得回归
 *   ③ !important
 *   ④ 重复选择器（模板串内按规则块展开后比较）
 *   ⑤ 非 Asia/Shanghai 的时间格式调用
 *   ⑥ 未转义插值（`${…}` 直入 HTML 的可疑点）—— 提示级，不计入失败
 *   ⑦ CSS 规则块外的游离声明                 ← P0 已修复
 *   ⑧ 引用了但从未定义的 class               ← P0 已修复
 *
 * 实现说明：样式以内联模板字符串书写，因此正则一律跑在
 * `newline→space` 归一化后的文本上，避免多行选择器被截断。
 *
 * 用法：
 *   cd dsh-hub && node scripts/ui-audit.mjs            # 报告 + 有阻断级命中则退出码 1
 *   cd dsh-hub && node scripts/ui-audit.mjs --baseline # 只打印命中数（记录基线用）
 */
import { readFileSync, globSync } from 'node:fs';

const BASELINE_ONLY = process.argv.includes('--baseline');
const SRC = 'src';
const files = globSync(`${SRC}/**/*.ts`).sort();
const TOKENS_FILE = 'src/views/styles/tokens.ts';
const TOKENS_MIGRATED = files.includes(TOKENS_FILE);

const read = (f) => readFileSync(f, 'utf8');
const flat = (text) => text.replace(/\r?\n/g, ' ');

const findings = [];
const add = (rule, file, line, detail) => findings.push({ rule, file, line, detail });

const definedVars = new Set();
const usedVars = new Map();
const definedClasses = new Set();
const flatByFile = new Map();

// ---------- 第一遍：定义 ----------
for (const f of files) {
  const text = read(f);
  const one = flat(text);
  flatByFile.set(f, one);

  if (f !== TOKENS_FILE) {
    text.split('\n').forEach((l, i) => {
      // 只认 CSS 值位置的颜色：`#rgb…`，或出现在声明值里的 rgb()/rgba()
      const hex = l.match(/#[0-9a-fA-F]{3,8}\b/);
      const rgba = /:\s*rgba?\(/.test(l.replace(/^\s*\/\*.*\*\/\s*$/, ''));
      if (hex) add('①颜色字面量', f, i + 1, hex[0]);
      else if (rgba) add('①颜色字面量', f, i + 1, 'rgba()');
    });
  }

  for (const m of one.matchAll(/(--[a-z0-9-]+)\s*:/gi)) definedVars.add(m[1]);
  // 选择器里出现的 class 即视为已定义（归一化后分号/花括号天然成为分隔）
  for (const m of one.matchAll(/\.([a-zA-Z][\w-]*)\s*[,{]/g)) definedClasses.add(m[1]);
}

// ---------- 第二遍：使用 ----------
for (const f of files) {
  const text = read(f);
  const one = flatByFile.get(f);

  for (const m of text.matchAll(/var\((--[a-z0-9-]+)/gi)) {
    const line = text.slice(0, m.index).split('\n').length;
    if (!usedVars.has(m[1])) usedVars.set(m[1], []);
    usedVars.get(m[1]).push({ file: f, line });
  }

  text.split('\n').forEach((l, i) => {
    if (l.includes('!important')) add('③!important', f, i + 1, l.trim().slice(0, 60));
    if (/toLocaleString|toLocaleDateString|toLocaleTimeString/.test(l) && !/Asia\/Shanghai|timeZone/.test(l)) {
      add('⑤时间格式', f, i + 1, l.trim().slice(0, 70));
    }
  });

  // ④ 重复选择器：模板串内的「选择器 {」
  const seenSel = new Map();
  for (const m of one.matchAll(/([^{}();=`]{0,200}?)\{/g)) {
    const raw = m[1];
    if (!raw || /[=()`$]/.test(raw)) continue;
    for (const part of raw.split(',')) {
      const sel = part.trim().replace(/\s+/g, ' ');
      if (!sel || !/^[.#@a-zA-Z[]/.test(sel)) continue;
      if (/[;:{}]/.test(sel) && !sel.startsWith('@')) continue;
      const start = part.search(/\S|$/);
      const line = text.slice(0, m.index + raw.indexOf(part) + start).split('\n').length;
      if (!seenSel.has(sel)) seenSel.set(sel, []);
      seenSel.get(sel).push(line);
    }
  }
  for (const [sel, ls] of seenSel) {
    if (ls.length > 1 && /^[.#]/.test(sel)) {
      for (const l of ls.slice(1)) add('④重复选择器', f, l, `${sel}（同文件出现 ${ls.length} 次）`);
    }
  }

  // ⑥ 转义检查（仅视图层与网关有意义；提示级）
  if (f.includes('/views/') || f.includes('gateway')) {
    text.split('\n').forEach((l, i) => {
      const safe = /escapeHtml|csrfField|JSON\.stringify|formatMoney|formatDateTime|formatDate|formatNumber|formatEmpty/;
      if (/\$\{[^}]*\}/.test(l) && /<[a-z]+[^>]*>\$\{/.test(l) && !safe.test(l)) {
        add('⑥插值待核', f, i + 1, l.trim().slice(0, 70));
      }
    });
  }

  // ⑧ 使用但未定义的 class
  text.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/class="([^"${]*)"/g)) {
      for (const c of m[1].split(/\s+/)) {
        if (!c || definedClasses.has(c)) continue;
        if (/^(dsh|ds-|plugin|univer)/.test(c)) continue; // 插件注入的类名不算
        add('⑧未定义class', f, i + 1, c);
      }
    }
  });
}

// ---------- ② 未定义变量 ----------
for (const [name, uses] of usedVars) {
  if (!definedVars.has(name)) for (const u of uses) add('②未定义变量', u.file, u.line, name);
}

// ---------- ⑦ 游离声明 ----------
// 形态：某规则 `}` 闭合后，在下一个选择器（以 . # 字母 [ 开头 + `{`）之前
// 出现孤立的 `属性: 值;`，例如 `.a {…} cursor: pointer; .b {…}`。
for (const f of files) {
  const text = read(f);
  const one = flatByFile.get(f);
  const re = /\}\s*([a-z-]+\s*:\s*[^;{}]+;)\s*[.#a-zA-Z[]/g;
  let m;
  while ((m = re.exec(one)) !== null) {
    const decl = m[1].trim();
    const flatIdx = m.index + m[0].indexOf(m[1]);
    // 由归一化文本的下标还原原始行号：统计其前文本中的换行贡献
    const line = text.slice(0, Math.min(flatIdx, text.length)).split('\n').length;
    add('⑦游离声明', f, line, decl);
  }
}

// ---------- 输出 ----------
const order = ['①颜色字面量', '②未定义变量', '③!important', '④重复选择器', '⑤时间格式', '⑦游离声明', '⑧未定义class', '⑥插值待核'];
const byRule = new Map();
for (const x of findings) byRule.set(x.rule, (byRule.get(x.rule) ?? 0) + 1);

if (BASELINE_ONLY) {
  console.log(`命中总数=${findings.length}`);
  for (const rule of order) if (byRule.has(rule)) console.log(`  ${rule}: ${byRule.get(rule)}`);
  process.exit(0);
}

console.log('=== UI 静态自查 ===');
console.log(`扫描 ${files.length} 个 .ts 文件；tokens.ts ${TOKENS_MIGRATED ? '已存在' : '尚未拆分'}；已定义 class ${definedClasses.size} 个 / 变量 ${definedVars.size} 个`);
for (const rule of order) {
  const list = findings.filter((x) => x.rule === rule);
  if (!list.length) continue;
  console.log(`\n[${rule}] 命中 ${list.length} 处`);
  for (const x of list.slice(0, 25)) console.log(`  ${x.file}:${x.line}  ${x.detail}`);
  if (list.length > 25) console.log(`  …（另有 ${list.length - 25} 处）`);
}
const blocking = findings.filter((x) => x.rule !== '⑥插值待核').length;
console.log(`\n阻断级命中：${blocking} 处（另有提示级 ⑥ ${byRule.get('⑥插值待核') ?? 0} 处）`);
console.log(blocking === 0 ? 'PASS：无阻断级命中' : 'FAIL：仍有阻断级命中');
process.exit(blocking === 0 ? 0 : 1);
