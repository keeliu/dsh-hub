// src/membership.ts — 会员系统核心逻辑
import type { DatabaseSync } from 'node:sqlite';
import { audit } from './db.js';
import { ensureInstanceForUser } from './instances.js';

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
  const now = Date.now();

  // 体验会员：检查是否已使用过
  if (type === 'trial') {
    const membership = getUserMembership(db, userId);
    if (membership.trialUsed) {
      throw new Error('体验会员已使用过，无法重复领取');
    }
  }

  const result = db.prepare(`
    INSERT INTO orders (user_id, membership_type, amount, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(userId, type, config.price, now);

  const orderId = Number(result.lastInsertRowid);

  // 立即激活会员（当前阶段：订单创建即激活）
  activateMembership(db, userId, type, orderId, now);

  // 标记订单为已支付（后续接入支付后改为回调更新）
  db.prepare(`UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?`).run(now, orderId);

  audit(db, 'order_create', userId, userId, `type=${type},order_id=${orderId}`);
  audit(db, 'order_pay', userId, userId, `order_id=${orderId}`);

  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as unknown as OrderRow;
}

// ─── 会员激活 ────────────────────────────────────────────────────────────────

function activateMembership(
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
