// scripts/format-selftest.mjs — 金额/时间/枚举格式化自测（tasks 1.1.3）
//
// 格式化是唯一真相源：所有展示路径都必须经过它，
// 因此这里的断言同时是「单位换算正确性」与「展示一致性」的防线。
//
// 用法：cd dsh-hub && node scripts/format-selftest.mjs
const f = await import('../src/views/format.ts');

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`[PASS] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name} — expected ${e} got ${a}`); }
}
function throws(name, fn) {
  try { fn(); fail++; console.log(`[FAIL] ${name} — 期望抛错但成功返回`); }
  catch { pass++; console.log(`[PASS] ${name}`); }
}

console.log('--- yuanToCents：元 → 分 ---');
check('整数元', f.yuanToCents('19'), 1900);
check('一位小数', f.yuanToCents('19.9'), 1990);
check('两位小数', f.yuanToCents('19.90'), 1990);
check('数值入参', f.yuanToCents(198), 19800);
check('零', f.yuanToCents('0'), 0);
check('常见定价 0.01', f.yuanToCents('0.01'), 1);
check('十进制浮点陷阱 1.1', f.yuanToCents('1.1'), 110);
check('大额', f.yuanToCents('19999.99'), 1999999);
throws('拒绝空串', () => f.yuanToCents(''));
throws('拒绝非数字', () => f.yuanToCents('abc'));
throws('拒绝负值', () => f.yuanToCents('-1'));
throws('拒绝三位小数', () => f.yuanToCents('1.999'));
throws('拒绝千分位', () => f.yuanToCents('1,990'));

console.log('--- centsToYuan / formatMoney：分 → 展示 ---');
check('centsToYuan 1990', f.centsToYuan(1990), '19.90');
check('centsToYuan 0', f.centsToYuan(0), '0.00');
check('formatMoney 1990', f.formatMoney(1990), '¥19.90');
check('formatMoney 199000 带千分位', f.formatMoney(199000), '¥1,990.00');
check('formatMoney 0', f.formatMoney(0), '¥0.00');
check('formatMoney 1 分', f.formatMoney(1), '¥0.01');

console.log('--- formatNumber ---');
check('千分位整数', f.formatNumber(1092977239), '1,092,977,239');
check('两位小数', f.formatNumber(86.76, 2), '86.76');
check('0 位小数四舍五入', f.formatNumber(86.76, 0), '87');

console.log('--- formatDateTime：固定 Asia/Shanghai，不依赖宿主 locale ---');
// 2026-10-11T01:49:55Z = 2026-10-11 09:49:55 +08:00
check('UTC 零点跨日', f.formatDateTime(Date.UTC(2026, 9, 10, 16, 0, 0)), '2026-10-11 00:00:00');
check('常规时刻', f.formatDateTime(Date.UTC(2026, 9, 11, 1, 49, 55)), '2026-10-11 09:49:55');
check('跨年前夜', f.formatDateTime(Date.UTC(2025, 11, 31, 16, 0, 0)), '2026-01-01 00:00:00');
check('formatDate 截断', f.formatDate(Date.UTC(2026, 9, 11, 1, 49, 55)), '2026-10-11');

console.log('--- formatEmpty ---');
check('null → 占位符', f.formatEmpty(null), f.EMPTY_PLACEHOLDER);
check('undefined → 占位符', f.formatEmpty(undefined), f.EMPTY_PLACEHOLDER);
check('空串 → 占位符', f.formatEmpty(''), f.EMPTY_PLACEHOLDER);
check('0 不算空', f.formatEmpty(0), '0');
check('false 不算空', f.formatEmpty(false), 'false');

console.log('--- 枚举中文化 ---');
check('实例状态 running', f.instanceStatusLabel('running'), '运行中');
check('实例状态 failed', f.instanceStatusLabel('failed'), '异常');
check('未知实例状态回退原值', f.instanceStatusLabel('weird'), 'weird');
check('角色 root', f.roleLabel('root'), '超级管理员');
check('角色 user', f.roleLabel('user'), '普通用户');
check('订单状态 paid', f.orderStatusLabel('paid'), '已支付');
check('订单状态 pending', f.orderStatusLabel('pending'), '待支付');
check('会员类型 monthly', f.membershipTypeLabel('monthly'), '月度会员');
check('会员类型空值为占位符', f.membershipTypeLabel(null), f.EMPTY_PLACEHOLDER);
check('审计动作 setup 有中文', typeof f.auditActionLabel('setup') === 'string' && f.auditActionLabel('setup') !== 'setup', true);
check('未登记审计动作回退原值', f.auditActionLabel('not_registered_action'), 'not_registered_action');

console.log(`\n===== 格式化自测：PASS=${pass} FAIL=${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
