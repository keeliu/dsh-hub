/**
 * DSH Hub · 插件树准备（装/重建）在途登记表
 *
 * 职责：让「建实例时后台装树」与「启动时后台装树」这两条路径互相看见。
 *
 * 为什么需要：
 *   - `instances.ts::createInstance` 在模板不可用时 fire-and-forget 地装树（不能阻塞建实例请求）；
 *   - `spawn.ts::startInstance` 现在也把装树放到后台（首次以非内置版本启动要经 npx 下载数百 MB）；
 *   - 用户「建完实例立刻点启动」时两条路径会同时对着同一个 DSH_HOME 跑 `dsh plugin add`，
 *     装出互相踩踏的插件树。启动路径必须先 await 在途的建实例安装，再判断是否需要自己装。
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * 整个「启动流程」是否在途（含装树 + spawn + 探活），以及是否已被「停止」请求取消。
 *
 * 为什么不能只看 DB 状态：异步启动的窗口里实例一直是 `starting`，而 `stopInstance`
 * 把状态推进到 `stopping/stopped` 之后，后台任务如果正好走过它自己的状态检查、
 * 进入 spawnAndProbe，就会再次把状态写回 starting 并拉起一个没人管的进程。
 * 因此用显式的取消标记做双向握手：stop 登记取消 → 后台任务在 spawn 前后各查一次。
 */
const startingIds = new Set<string>();
const cancelledIds = new Set<string>();

/** 标记「该实例整个启动流程在途」；同时清掉上一轮的取消标记。 */
export function markStart(instanceId: string): void {
  startingIds.add(instanceId);
  cancelledIds.delete(instanceId);
}

/** 启动流程结束（成功/失败/取消）后调用。 */
export function unmarkStart(instanceId: string): void {
  startingIds.delete(instanceId);
  cancelledIds.delete(instanceId);
}

/** 该实例是否正在启动（含后台装树/探活）。 */
export function isStartInFlight(instanceId: string): boolean {
  return startingIds.has(instanceId);
}

/** 「停止」请求登记取消：后台启动任务看到后不得把实例拉起来。 */
export function cancelStart(instanceId: string): void {
  cancelledIds.add(instanceId);
}

/** 后台启动任务在 spawn 前后检查：已被取消则放弃/回收。 */
export function isStartCancelled(instanceId: string): boolean {
  return cancelledIds.has(instanceId);
}

/** 登记一次插件树准备；返回同一个 promise，便于调用方继续链式处理。 */
export function trackPrep<T>(instanceId: string, task: Promise<T>): Promise<T> {
  const tracked: Promise<T> = task.finally(() => {
    if (inFlight.get(instanceId) === tracked) inFlight.delete(instanceId);
  });
  inFlight.set(instanceId, tracked);
  return tracked;
}

/** 该实例是否已有在途的插件树准备；有则调用方应 await 它而不是并发再装一遍。 */
export function getPrep(instanceId: string): Promise<unknown> | undefined {
  return inFlight.get(instanceId);
}
