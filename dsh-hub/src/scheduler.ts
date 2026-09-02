/**
 * DSH Hub · 定时任务调度器
 *
 * 基于 setInterval 的零依赖定时任务，用于：
 * - 会员到期检查（停止实例 + 更新状态 + 发邮件）
 * - 到期提醒（提前 3 天发送提醒邮件）
 */
import type { DatabaseSync } from 'node:sqlite';
import { getExpiryCheckInterval } from './config.ts';
import { listRunningInstances } from './instances.ts';
import { stopInstance } from './supervisor/stop.ts';
import { sendEmail } from './email.ts';

export interface Scheduler {
  stop(): void;
}

interface UserRow {
  id: number;
  nickname: string;
  email: string | null;
}

export function startScheduler(db: DatabaseSync): Scheduler {
  const interval = setInterval(() => {
    processExpiries(db).catch(err => {
      console.error('[scheduler] Error processing expiries:', err);
    });
  }, getExpiryCheckInterval());

  // 启动时立即执行一次
  processExpiries(db).catch(err => {
    console.error('[scheduler] Error processing expiries on startup:', err);
  });

  return {
    stop() {
      clearInterval(interval);
    },
  };
}

async function processExpiries(db: DatabaseSync): Promise<void> {
  const now = Date.now();
  const reminderThreshold = now + 3 * 24 * 3600 * 1000; // 3 天后

  // 1. 已到期：停止实例 + 更新状态
  const expired = db.prepare(
    `SELECT id, nickname, email FROM users
     WHERE membership_expires_at IS NOT NULL
       AND membership_expires_at <= ?
       AND membership_type IS NOT NULL`,
  ).all(now) as unknown as UserRow[];

  for (const user of expired) {
    try {
      // 停止该用户的所有运行中实例
      const runningInstances = listRunningInstances(db, user.id);
      for (const instance of runningInstances) {
        await stopInstance(db, instance);
      }
      db.prepare('UPDATE users SET membership_type = NULL WHERE id = ?').run(user.id);
      sendExpiryEmail(user);
    } catch (err) {
      console.error(`[scheduler] Failed to process expiry for user ${user.id}:`, err);
    }
  }

  // 2. 即将到期：发送提醒
  const expiringSoon = db.prepare(
    `SELECT id, nickname, email FROM users
     WHERE membership_expires_at IS NOT NULL
       AND membership_expires_at > ?
       AND membership_expires_at <= ?
       AND membership_type IS NOT NULL`,
  ).all(now, reminderThreshold) as unknown as UserRow[];

  for (const user of expiringSoon) {
    try {
      sendReminderEmail(user);
    } catch (err) {
      console.error(`[scheduler] Failed to send reminder for user ${user.id}:`, err);
    }
  }
}

function sendExpiryEmail(user: UserRow): void {
  if (!user.email) return;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ff4d4f;">会员已到期</h2>
      <p>亲爱的 ${escapeHtml(user.nickname)}，</p>
      <p>您的会员已到期，实例已自动停止。如需继续使用，请及时续费。</p>
      <p style="margin-top: 20px;">
        <a href="https://hub.wuyajun.cn/membership" style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">续费会员</a>
      </p>
    </div>
  `;
  sendEmail(user.email, '乌鸦 Work - 会员到期通知', html).catch(err => {
    console.error(`[scheduler] Failed to send expiry email to ${user.email}:`, err);
  });
}

function sendReminderEmail(user: UserRow): void {
  if (!user.email) return;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0066cc;">会员即将到期</h2>
      <p>亲爱的 ${escapeHtml(user.nickname)}，</p>
      <p>您的会员将在 3 天后到期。为避免服务中断，请及时续费。</p>
      <p style="margin-top: 20px;">
        <a href="https://hub.wuyajun.cn/membership" style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">立即续费</a>
      </p>
    </div>
  `;
  sendEmail(user.email, '乌鸦 Work - 会员到期提醒', html).catch(err => {
    console.error(`[scheduler] Failed to send reminder email to ${user.email}:`, err);
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
