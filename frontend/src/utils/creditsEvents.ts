/** 积分余额变更事件：Header/团队配额等监听并重新拉取 */
export const CREDITS_REFRESH_EVENT = 'refresh-credits';

/** 通知前端积分/团队配额相关 UI 立即刷新 */
export function notifyCreditsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT));
}
