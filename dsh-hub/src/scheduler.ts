// src/scheduler.ts — 定时任务调度器
import type { DatabaseSync } from 'node:sqlite';
import { expireMemberships } from './membership.ts';

let timer: ReturnType<typeof setInterval> | null = null;

/** 启动定时任务（每天午夜检查会员到期） */
export function startScheduler(db: DatabaseSync): void {
  if (timer) return;
  
  // 计算到下一个午夜的毫秒数
  function msUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  // 午夜检查函数
  function checkExpiry(): void {
    try {
      const count = expireMemberships(db);
      if (count > 0) {
        console.log(`[scheduler] 已处理 ${count} 个到期会员`);
      }
    } catch (e) {
      console.error('[scheduler] 会员到期检查失败:', e);
    }
  }

  // 启动时先执行一次
  checkExpiry();

  // 设置定时器：到午夜后执行，然后每24小时执行一次
  const initialDelay = msUntilMidnight();
  console.log(`[scheduler] 会员到期检查将在 ${Math.round(initialDelay / 60000)} 分钟后首次执行`);
  
  setTimeout(() => {
    checkExpiry();
    timer = setInterval(checkExpiry, 24 * 60 * 60 * 1000);
  }, initialDelay);
}

/** 停止定时任务 */
export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
