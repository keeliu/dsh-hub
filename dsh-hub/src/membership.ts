// src/membership.ts — 会员系统核心逻辑
import type { DatabaseSync } from 'node:sqlite';
import { audit } from './db.ts';
import { ensureInstanceForUser } from './instances.ts';
import { correctedNow } from './config.ts';

// ─── 类型 ────────────────────────────────────────────────────────────────────

export type MembershipType = 'trial' | 'monthly' | 'yearly';
export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'refunded';

export interface MembershipRow {
  id: number;
  user_id: number;
  type: MembershipType;
  starts_at: number;
  expires_at: number;
  order_id: number | null;
  created_at: number;
}

export interface OrderRow {
  id: number;
  user_id: number;
  membership_type: MembershipType;
  amount: number;
  status: OrderStatus;
  payment_method: string | null;
  payment_id: string | null;
  created_at: number;
  paid_at: number | null;
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

export const MEMBERSHIP_CONFIG: Record<MembershipType, {
  label: string;
  durationDays: number;
  price: number;
  trial: boolean;
}> = {
  trial:    { label: '1天体验会员', durationDays: 1,  price: 0,    trial: true  },
  monthly:  { label: '1个月会员',   durationDays: 30, price: 19.9, trial: false },
  yearly:   { label: '1年会员',     durationDays: 365, price: 198,  trial: false },
};

// ─── 价格管理 ────────────────────────────────────────────────────────────────

/** 获取套餐价格（优先从数据库读取，否则使用默认价格） */
export function getMembershipPrice(db: DatabaseSync, type: MembershipType): number {
  const row = db.prepare('SELECT price FROM membership_prices WHERE type = ?').get(type) as { price: number } | undefined;
  if (row) return row.price;
  return MEMBERSHIP_CONFIG[type].price;
}

/** 获取套餐原价 */
export function getMembershipOriginalPrice(db: DatabaseSync, type: MembershipType): number {
  const row = db.prepare('SELECT original_price FROM membership_prices WHERE type = ?').get(type) as { original_price: number } | undefined;
  if (row && row.original_price > 0) return row.original_price;
  // 默认原价（单位：分）
  const defaults: Record<MembershipType, number> = { trial: 990, monthly: 2990, yearly: 29900 };
  return defaults[type];
}

/** 获取所有套餐价格（包含原价和优惠价） */
export function getAllMembershipPrices(db: DatabaseSync): Record<MembershipType, { price: number; originalPrice: number }> {
  const rows = db.prepare('SELECT type, price, original_price FROM membership_prices').all() as { type: MembershipType; price: number; original_price: number }[];
  const defaults: Record<MembershipType, { price: number; originalPrice: number }> = {
    trial: { price: MEMBERSHIP_CONFIG.trial.price, originalPrice: 990 },
    monthly: { price: MEMBERSHIP_CONFIG.monthly.price, originalPrice: 2990 },
    yearly: { price: MEMBERSHIP_CONFIG.yearly.price, originalPrice: 29900 },
  };
  for (const row of rows) {
    defaults[row.type] = {
      price: row.price,
      originalPrice: row.original_price > 0 ? row.original_price : defaults[row.type].originalPrice,
    };
  }
  return defaults;
}

/** 设置套餐价格（包含原价和优惠价） */
export function setMembershipPrice(db: DatabaseSync, type: MembershipType, price: number, originalPrice: number, adminId: number): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO membership_prices (type, price, original_price, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(type) DO UPDATE SET price = excluded.price, original_price = excluded.original_price, updated_at = excluded.updated_at
  `).run(type, price, originalPrice, now);
  audit(db, 'membership_price_update', adminId, null, `set ${type} price to ${price}, original to ${originalPrice}`);
}

// ─── 会员查询 ────────────────────────────────────────────────────────────────

export function getUserMembership(db: DatabaseSync, userId: number): {
  type: MembershipType | null;
  expiresAt: number | null;
  isActive: boolean;
  trialUsed: boolean;
} {
  const user = db.prepare(
    'SELECT membership_type, membership_expires_at, trial_used FROM users WHERE id = ?'
  ).get(userId) as { membership_type: string | null; membership_expires_at: number | null; trial_used: number } | undefined;

  if (!user) throw new Error('user not found');

  const now = Date.now();
  const isActive = user.membership_type !== null
    && user.membership_expires_at !== null
    && user.membership_expires_at > now;

  return {
    type: (user.membership_type as MembershipType) ?? null,
    expiresAt: user.membership_expires_at,
    isActive,
    trialUsed: user.trial_used === 1,
  };
}

export function hasActiveMembership(db: DatabaseSync, userId: number): boolean {
  return getUserMembership(db, userId).isActive;
}

// ─── 订单创建 ────────────────────────────────────────────────────────────────

export function createOrder(db: DatabaseSync, userId: number, type: MembershipType): OrderRow {
  const config = MEMBERSHIP_CONFIG[type];
  const now = correctedNow();

  if (type === 'trial') {
    const membership = getUserMembership(db, userId);
    if (membership.trialUsed) {
      throw new Error('体验会员已使用过，无法重复领取');
    }
  }

  const price = getMembershipPrice(db, type);
  const result = db.prepare(`
    INSERT INTO orders (user_id, membership_type, amount, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(userId, type, price, now);

  const orderId = Number(result.lastInsertRowid);

  // 体验会员免费，直接激活
  if (type === 'trial') {
    activateMembership(db, userId, type, orderId, now);
    db.prepare(`UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?`).run(now, orderId);
    audit(db, 'order_create', userId, userId, `type=${type},order_id=${orderId}`);
    audit(db, 'order_pay', userId, userId, `order_id=${orderId}`);
  } else {
    audit(db, 'order_create', userId, userId, `type=${type},order_id=${orderId}`);
  }

  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as unknown as OrderRow;
}

// ─── 会员激活 ────────────────────────────────────────────────────────────────

export function activateMembership(
  db: DatabaseSync,
  userId: number,
  type: MembershipType,
  orderId: number,
  now: number,
): void {
  const config = MEMBERSHIP_CONFIG[type];
  const durationMs = config.durationDays * 24 * 60 * 60 * 1000;

  // 续费时从当前到期时间开始计算（而非当前时间）
  const current = getUserMembership(db, userId);
  const baseTime = current.isActive && current.expiresAt ? Math.max(current.expiresAt, now) : now;
  const expiresAt = baseTime + durationMs;

  // 更新用户表
  const trialUsed = type === 'trial' ? 1 : (current.trialUsed ? 1 : 0);
  db.prepare(`
    UPDATE users
    SET membership_type = ?, membership_expires_at = ?, trial_used = ?
    WHERE id = ?
  `).run(type, expiresAt, trialUsed, userId);

  // 写入 memberships 历史
  db.prepare(`
    INSERT INTO memberships (user_id, type, starts_at, expires_at, order_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, type, baseTime, expiresAt, orderId, now);

  // 会员激活后自动创建 DSH 实例
  ensureInstanceForUser(db, userId);

  audit(db, type === 'trial' ? 'membership_create' : 'membership_renew', userId, userId,
    `type=${type},expires_at=${expiresAt},order_id=${orderId}`);
}

// ─── 到期检查 ────────────────────────────────────────────────────────────────

export function expireMemberships(db: DatabaseSync): number {
  const now = Date.now();
  const result = db.prepare(`
    UPDATE users
    SET membership_type = NULL, membership_expires_at = NULL
    WHERE membership_type IS NOT NULL
      AND membership_expires_at IS NOT NULL
      AND membership_expires_at <= ?
  `).run(now);

  const expiredCount = Number(result.changes);
  if (expiredCount > 0) {
    audit(db, 'membership_expire', null, null, `expired_count=${expiredCount}`);
  }
  return expiredCount;
}

// ─── 管理员设置会员 ──────────────────────────────────────────────────────────

export function adminSetMembership(
  db: DatabaseSync,
  adminId: number,
  userId: number,
  type: MembershipType,
  durationDays: number,
): void {
  const now = Date.now();
  const expiresAt = now + durationDays * 24 * 60 * 60 * 1000;

  db.prepare(`
    UPDATE users
    SET membership_type = ?, membership_expires_at = ?
    WHERE id = ?
  `).run(type, expiresAt, userId);

  audit(db, 'membership_create', adminId, userId, `admin_set,type=${type},days=${durationDays}`);
}

// ─── 订单查询 ────────────────────────────────────────────────────────────────

export function getUserOrders(db: DatabaseSync, userId: number): OrderRow[] {
  return db.prepare(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId) as unknown as OrderRow[];
}

export function getAllOrders(db: DatabaseSync, limit = 50, offset = 0): OrderRow[] {
  return db.prepare(
    'SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as unknown as OrderRow[];
}

export function getOrderById(db: DatabaseSync, orderId: number): OrderRow | undefined {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as unknown as OrderRow | undefined;
}

// ─── 支付回调处理 ────────────────────────────────────────────────────────────

export function handlePaymentCallback(
  db: DatabaseSync,
  tradeOrderId: string,
  totalFee: string,
  transactionId: string,
  status: string,
): { ok: boolean; message: string } {
  const orderId = Number(tradeOrderId);
  const order = getOrderById(db, orderId);

  if (!order) {
    return { ok: false, message: 'order not found' };
  }

  // 幂等：已支付直接返回成功
  if (order.status === 'paid') {
    return { ok: true, message: 'already paid' };
  }

  // 金额校验
  const expectedFee = order.amount.toFixed(2);
  const actualFee = Number(totalFee).toFixed(2);
  if (expectedFee !== actualFee) {
    audit(db, 'order_pay', null, order.user_id,
      `fee_mismatch,order_id=${orderId},expected=${expectedFee},actual=${actualFee}`);
    return { ok: false, message: 'fee mismatch' };
  }

  if (status !== 'OD') {
    return { ok: false, message: `unexpected status: ${status}` };
  }

  const now = Date.now();

  // 更新订单状态
  db.prepare(`
    UPDATE orders SET status = 'paid', paid_at = ?, payment_id = ?, payment_method = 'xunhupay'
    WHERE id = ?
  `).run(now, transactionId, orderId);

  // 激活会员
  activateMembership(db, order.user_id, order.membership_type, orderId, now);

  audit(db, 'order_pay', order.user_id, order.user_id,
    `order_id=${orderId},transaction_id=${transactionId}`);

  return { ok: true, message: 'success' };
}
