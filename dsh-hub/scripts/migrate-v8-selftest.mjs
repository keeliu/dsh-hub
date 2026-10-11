// scripts/migrate-v8-selftest.mjs — 迁移 v8（金额列重建为整数分）自测
//
// v8 的语义：**只重建列亲和性，不改写存量数值**。
// 数值本身无法区分「1990 分」与「1990 元」，任何 ×100 启发式都会猜错，
// 因此迁移只保证：存储类收敛为 integer、约束到位、业务字段不丢、幂等。
//
// 用法：cd dsh-hub && TMPDIR=/data/dsh/home/.m2tmp node scripts/migrate-v8-selftest.mjs
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'migrate-v8-'));
process.env.DSH_HUB_DATA = dir;

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`[PASS] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name} — expected ${e} got ${a}`); }
}

/** 建一个 v7 旧库：结构等价于 v1–v7 迁移后的结果 */
function buildV7Db(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version (version) VALUES (7);
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, nickname TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL,
      dir_name TEXT UNIQUE NOT NULL, username TEXT UNIQUE, email TEXT UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      max_instances INTEGER NOT NULL DEFAULT 3, max_running INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, last_login_at INTEGER,
      membership_type TEXT, membership_expires_at INTEGER, trial_used INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO users (id, nickname, slug, dir_name, password_hash, role, created_at)
      VALUES (1, '管理员', 'u-aaaaaaaa', '管理员', 'x', 'root', 0);
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      membership_type TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount >= 0),
      status TEXT NOT NULL, payment_method TEXT, payment_id TEXT,
      order_no TEXT NOT NULL DEFAULT '', payment_order_id TEXT,
      created_at INTEGER NOT NULL, paid_at INTEGER
    );
    CREATE TABLE membership_prices (
      id INTEGER PRIMARY KEY, type TEXT NOT NULL UNIQUE,
      price REAL NOT NULL CHECK(price >= 0),
      original_price REAL NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
    );
    CREATE TABLE memberships (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL, starts_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL, created_at INTEGER NOT NULL
    );
  `);
  // 混存场景：正确分值 + 遗留元值
  db.exec(`
    INSERT INTO orders (id, user_id, membership_type, amount, status, order_no, payment_order_id, created_at)
    VALUES
      (1, 1, 'monthly', 1990, 'paid', 'NO-1', 'PAY-1', 1000),
      (2, 1, 'monthly', 19.9, 'pending', 'NO-2', NULL, 2000),
      (3, 1, 'yearly', 198, 'paid', 'NO-3', 'PAY-3', 3000);
    INSERT INTO membership_prices (id, type, price, original_price, updated_at) VALUES
      (1, 'trial', 0, 990, 0),
      (2, 'monthly', 1990, 2990, 0),
      (3, 'yearly', 19.9, 198, 0);
    INSERT INTO memberships (id, user_id, type, starts_at, expires_at, order_id, created_at)
    VALUES (1, 1, 'monthly', 0, 9999999999999, 1, 0);
  `);
  const before = db.prepare('SELECT order_id FROM memberships WHERE id = 1').get();
  const ok = before && before.order_id === 1;
  console.log(`[setup] v7 库 memberships.order_id = ${JSON.stringify(before)} ${ok ? '' : '← 建库阶段就不对，后续断言无意义'}`);
  db.close();
}

const dbPath = join(dir, 'dshhub.db');
buildV7Db(dbPath);

// 用真实迁移路径跑（openDb → migrate），与生产启动时完全一致
const { openDb, migrate, getSuspiciousMoneyValues } = await import('../src/db.ts');
const db = openDb({ dataDir: dir });

console.log('--- orders.amount ---');
const orders = db.prepare('SELECT id, amount, typeof(amount) AS t, order_no, payment_order_id FROM orders ORDER BY id').all();
check('存量值不被放大（1990 保持 1990）', orders[0].amount, 1990);
check('存量 REAL 值被整数化（19.9 → 20）', orders[1].amount, 20);
check('存量整数值不被改写（198 → 198）', orders[2].amount, 198);
check('金额存储类收敛为 integer', orders.map(o => o.t), ['integer', 'integer', 'integer']);
check('订单号保留', orders.map(o => o.order_no), ['NO-1', 'NO-2', 'NO-3']);
check('支付单号保留', orders.map(o => o.payment_order_id), ['PAY-1', null, 'PAY-3']);

console.log('--- membership_prices ---');
const prices = db.prepare('SELECT type, price, original_price, typeof(price) AS t, typeof(original_price) AS t2 FROM membership_prices ORDER BY id').all();
check('trial 价格保留', [prices[0].price, prices[0].original_price], [0, 990]);
check('monthly 分值保留', [prices[1].price, prices[1].original_price], [1990, 2990]);
check('yearly 存量值保留且整数化', [prices[2].price, prices[2].original_price], [20, 198]);
check('价格列存储类收敛为 integer', prices.map(p => [p.t, p.t2]), [['integer','integer'],['integer','integer'],['integer','integer']]);

console.log('--- 列亲和性（REAL 值不会被亲和性静默取整，属已知边界）---');
db.exec(`INSERT INTO orders (id, user_id, membership_type, amount, status, order_no, created_at)
         VALUES (99, 1, 'monthly', 20, 'pending', 'NO-99', 0)`);
const probe = db.prepare('SELECT amount, typeof(amount) AS t FROM orders WHERE id = 99').get();
check('新写入整数值以 integer 存储', [probe.amount, probe.t], [20, 'integer']);
db.exec(`INSERT INTO orders (id, user_id, membership_type, amount, status, order_no, created_at)
         VALUES (98, 1, 'monthly', 19.9, 'pending', 'NO-98', 0)`);
const probe2 = db.prepare('SELECT amount, typeof(amount) AS t FROM orders WHERE id = 98').get();
console.log(`   [observed] 写入 19.9 → ${JSON.stringify(probe2)}（INTEGER 亲和性只在无损时才转整数，故小数原样落库；业务侧一律写入 yuanToCents 结果）`);

console.log('--- 外键与版本 ---');
const mem = db.prepare('SELECT order_id FROM memberships WHERE id = 1').get();
check('memberships 仍引用订单 1', mem?.order_id, 1);
check('schema_version = 8', db.prepare('SELECT version FROM schema_version').get().version, 8);
const fk = db.prepare('PRAGMA foreign_key_check').all();
check('无外键违规', fk.length, 0);

console.log('--- 迁移前备份 ---');
check('生成 dshhub.db.bak', existsSync(join(dir, 'dshhub.db.bak')), true);
const bak = new DatabaseSync(join(dir, 'dshhub.db.bak'));
check('备份仍是升级前的 v7 结构', bak.prepare('SELECT version FROM schema_version').get().version, 7);

console.log('--- 幂等：重复迁移不改动数据 ---');
db.exec('DELETE FROM orders WHERE id IN (98, 99)');
const before = db.prepare('SELECT id, amount FROM orders ORDER BY id').all().map(r => r.amount);
migrate(db);
const after = db.prepare('SELECT id, amount FROM orders ORDER BY id').all().map(r => r.amount);
check('重复 migrate 后金额不变', after, before);
check('重复 migrate 后仍为 v8', db.prepare('SELECT version FROM schema_version').get().version, 8);

console.log('--- 疑似单位混用提示 ---');
const susp = getSuspiciousMoneyValues(db);
console.log('  ', JSON.stringify(susp));
check('疑似值提示覆盖 orders 的 19.9→20', susp.some(s => s.table === 'orders' && s.id === 2), true);

db.close();
rmSync(dir, { recursive: true, force: true });

console.log(`\n===== 迁移 v8 自测：PASS=${pass} FAIL=${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
