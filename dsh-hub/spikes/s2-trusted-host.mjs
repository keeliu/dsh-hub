#!/usr/bin/env node
// S2 —— --trusted-host 的匹配规则静态分析：
// 在 dsh-web-app / dsh-web-frontend / web-runtime 相关产物里找 trustedHosts 的
// 消费点，摘录上下文，判断是「全等」「后缀」还是「包含」匹配。
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const nm = join(dirname(process.execPath), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai');
const targets = ['dsh-web-app', 'dsh-web-frontend'].map(p => join(nm, p));

const snippets = new Map();
const add = (file, idx, text) => {
  const key = text.slice(0, 80);
  if (!snippets.has(key)) snippets.set(key, { file: file.replace(nm + '/', ''), idx, text: text.slice(0, 400) });
};

for (const rootDir of targets) {
  const walk = (dir, depth = 0) => {
    if (depth > 5) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(js|mjs|cjs|html|json)$/.test(e.name)) {
        let t;
        try { t = readFileSync(p, 'utf8'); } catch { continue; }
        for (const m of t.matchAll(/trusted[-_]?hosts?/gi)) {
          const start = Math.max(0, m.index - 200);
          add(p, m.index, t.slice(start, m.index + m[0].length + 260).replace(/\s+/g, ' '));
          if (snippets.size > 40) break;
        }
      }
    }
  };
  if (existsSync(rootDir)) walk(rootDir);
}

console.log(`[S2] 命中 ${snippets.size} 处 trusted-host 引用：\n`);
for (const s of snippets.values()) console.log(`--- ${s.file}@+${s.idx}\n    ${s.text}\n`);
console.log('[S2] 提示：关注比较表达式是否出现 endsWith / includes / === 以及对端口的处理。');
