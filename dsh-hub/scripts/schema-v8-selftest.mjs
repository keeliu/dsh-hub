// scripts/schema-v8-selftest.mjs — 全新库迁移到 v8 后的结构/定价一致性自测
//
// 与 migrate-v8-selftest.mjs 互补：那个测「旧库升级」，这个测「新库建齐」。
// 重点防两类漂移：
//   1. 默认定价常量（DEFAULT_PRICES）与 v6 迁移播种值不一致 —— 会导致
//      「DB 无行时兜底价」与「实际售价」不同（历史上出现过年费 198/199/19900 三种说法）。
//   2. v8 之后金额列亲和性被后续改动改回 REAL。
//
// 用法：cd dsh-hub && node scripts/schema-v8-selftest.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'schema-v8-'));
process.env.DSH_HUB_DATA = dir;

const { openDb } = await import('../src/db.ts');
const { DEFAULT_PRICES } = await import('../src/membership.ts');

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`[PASS] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name} — expected ${e} got ${a}`); }
}

const db = openDb({ dataDir: dir });

console.log('--- schema 版本 ---');
check('全新库迁移到 v8', db.prepare('SELECT version FROM schema_version').get().version, 8);

console.log('--- 金额列亲和性 ---');
for (const [table, column] of [['orders', 'amount'], ['membership_prices', 'price'], ['membership_prices', 'original_price']]) {
  const ddl = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table).sql;
  const decl = new RegExp(`\\b${column}\\s+(\\w+)`).exec(ddl);
  check(`${table}.${column} 声明为 INTEGER`, decl?.[1], 'INTEGER');
}

console.log('--- 默认定价与播种一致 ---');
const seeded = db.prepare('SELECT type, price, original_price FROM membership_prices ORDER BY type').all();
const seededMap = Object.fromEntries(seeded.map(r => [r.type, { price: r.price, originalPrice: r.original_price }]));
check('trial', DEFAULT_PRICES.trial, seededMap.trial);
check('monthly', DEFAULT_PRICES.monthly, seededMap.monthly);
check('yearly', DEFAULT_PRICES.yearly, seededMap.yearly);

console.log('--- 价格兜底函数优先读 DB ---');
const { getMembershipPrice, getMembershipOriginalPrice } = await import('../src/membership.ts');
check('getMembershipPrice(yearly) 取 DB 值', getMembershipPrice(db, 'yearly'), seededMap.yearly.price);
check('getMembershipOriginalPrice(monthly) 取 DB 值', getMembershipOriginalPrice(db, 'monthly'), seededMap.monthly.originalPrice);
// 删掉一行以验证兜底路径与 DEFAULT_PRICES 同源
db.exec("DELETE FROM membership_prices WHERE type = 'yearly'");
check('DB 无行时兜底价 = DEFAULT_PRICES', getMembershipPrice(db, 'yearly'), DEFAULT_PRICES.yearly.price);
check('DB 无行时兜底原价 = DEFAULT_PRICES', getMembershipOriginalPrice(db, 'yearly'), DEFAULT_PRICES.yearly.originalPrice);

console.log('--- 外键完好 ---');
check('无外键违规', db.prepare('PRAGMA foreign_key_check').all().length, 0);

db.close();
rmSync(dir, { recursive: true, force: true });

console.log(`\n===== 全新库 schema v8 自测：PASS=${pass} FAIL=${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
