// src/views/format.ts — 展示层格式化收敛点
//
// 职责：所有面向用户的数值/时间格式化。视图中禁止出现裸 `.toFixed(2)`、
//   不指定时区的 `toLocaleString`、以及 `null`/`undefined` 直出。
//
// 关键决策：
//   1. 金额以「分」为唯一存储单位（见 openspec/specs/money-units.md），
//      `formatMoney` 接收分；元↔分换算只允许在支付边界调用。
//   2. 时间固定 `Asia/Shanghai` 手工拼装，不依赖宿主 locale/ICU。
//   3. 空值统一 `—`（U+2014，与 docs/05-设计规范.md §5 一致）。
//
// 文档：docs/05-设计规范.md §5、openspec/changes/ui-design-system/specs/money-units.md

/** 空值占位符（em dash） */
export const EMPTY_PLACEHOLDER = '—';

/** 展示时区：固定东八区，与 docs/05-设计规范.md §2 一致 */
const DISPLAY_TIME_ZONE = 'Asia/Shanghai';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

// ─── 金额 ────────────────────────────────────────────────────────────────────

/**
 * 元 → 分。
 *
 * 用于支付网关边界（虎皮椒 `total_fee` 为元字符串）。
 * 非法输入抛错而非静默取整：`"19.9"`/`"19.90"` → 1990；
 * `"19.999"`、`"-1"`、`"abc"`、`""`、`null` 一律拒绝。
 */
export function yuanToCents(yuan: string | number): number {
  if (yuan === null || yuan === undefined || yuan === '') {
    throw new Error('yuanToCents: empty value');
  }
  const raw = typeof yuan === 'string' ? yuan.trim() : String(yuan);
  if (raw === '') throw new Error('yuanToCents: empty value');
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`yuanToCents: not a decimal number: ${raw}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`yuanToCents: not finite: ${raw}`);
  }
  if (value < 0) {
    throw new Error(`yuanToCents: negative: ${raw}`);
  }
  const decimals = raw.includes('.') ? raw.split('.')[1]!.length : 0;
  if (decimals > 2) {
    throw new Error(`yuanToCents: more than 2 decimal places: ${raw}`);
  }
  // 先乘再四舍五入；加极小量抵消二进制浮点误差（37.005 * 100 === 3700.4999…）
  return Math.round(value * 100 + Number.EPSILON * value * 100);
}

/** 分 → 元字符串（保留 2 位小数），用于传给支付网关的 `total_fee` */
export function centsToYuan(cents: number): string {
  if (!Number.isFinite(cents)) {
    throw new Error(`centsToYuan: not finite: ${cents}`);
  }
  return (cents / 100).toFixed(2);
}

/** 分 → 千分位金额字符串，如 `¥1,990.00` */
export function formatMoney(cents: number): string {
  if (!Number.isFinite(cents)) return EMPTY_PLACEHOLDER;
  return `¥${formatNumber(cents / 100, 2)}`;
}

// ─── 数值 ────────────────────────────────────────────────────────────────────

/** 千分位数字；`digits` 为最大小数位（默认 0）。大数不缩写。 */
export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return EMPTY_PLACEHOLDER;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// ─── 时间 ────────────────────────────────────────────────────────────────────

/** 毫秒时间戳 → `YYYY-MM-DD HH:mm:ss`（Asia/Shanghai） */
export function formatDateTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return EMPTY_PLACEHOLDER;
  const shifted = new Date(ms + SHANGHAI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} `
    + `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
}

/** 毫秒时间戳 → `YYYY-MM-DD`（Asia/Shanghai） */
export function formatDate(ms: number | null | undefined): string {
  const full = formatDateTime(ms);
  return full === EMPTY_PLACEHOLDER ? full : full.slice(0, 10);
}

// ─── 空值 ────────────────────────────────────────────────────────────────────

/** 空值统一占位；`0` 与 `false` 不算空 */
export function formatEmpty(value: unknown): string {
  if (value === null || value === undefined) return EMPTY_PLACEHOLDER;
  if (typeof value === 'string' && value.trim() === '') return EMPTY_PLACEHOLDER;
  return String(value);
}

// ─── 枚举中文化 ──────────────────────────────────────────────────────────────

const INSTANCE_STATUS_LABELS: Record<string, string> = {
  stopped: '已停止',
  starting: '启动中',
  running: '运行中',
  stopping: '停止中',
  failed: '异常',
};

export function instanceStatusLabel(status: string): string {
  return INSTANCE_STATUS_LABELS[status] ?? status;
}

const ROLE_LABELS: Record<string, string> = {
  root: '超级管理员',
  admin: '管理员',
  user: '普通用户',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  refunded: '已退款',
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

const MEMBERSHIP_TYPE_LABELS: Record<string, string> = {
  trial: '体验会员',
  monthly: '月度会员',
  yearly: '年度会员',
};

export function membershipTypeLabel(type: string | null | undefined): string {
  if (!type) return EMPTY_PLACEHOLDER;
  return MEMBERSHIP_TYPE_LABELS[type] ?? type;
}

/** 审计动作中文化；未登记的动作回退英文原值，避免丢失信息 */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  setup: '初始化管理员',
  register: '用户注册',
  login: '登录',
  login_failed: '登录失败',
  logout: '登出',
  password_reset_request: '申请重置密码',
  password_reset: '重置密码',
  user_create: '创建用户',
  user_update: '修改用户',
  user_disable: '封禁用户',
  user_enable: '解封用户',
  user_delete: '删除用户',
  token_create: '签发 API Token',
  token_revoke: '吊销 API Token',
  instance_create: '创建实例',
  instance_start: '启动实例',
  instance_stop: '停止实例',
  instance_restart: '重启实例',
  instance_delete: '删除实例',
  instance_reclaim: '认领孤儿实例',
  order_create: '创建订单',
  order_pay: '订单支付',
  order_cancel: '取消订单',
  membership_create: '开通会员',
  membership_renew: '续费会员',
  membership_expire: '会员到期',
  membership_price_update: '修改套餐价格',
  settings_update: '修改全局设置',
  preset_plugins_update: '修改预置插件',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
