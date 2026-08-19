/** 画布居中促销海报：2026-08-06 ~ 2026-08-21（含首尾日，本地时区） */
export const CANVAS_SUMMER_PROMO = {
  id: "canvas-summer-promo-20260806",
  start: new Date(2026, 7, 6, 0, 0, 0, 0), // month is 0-indexed
  end: new Date(2026, 7, 21, 23, 59, 59, 999),
  /** 与 MembershipPlan vip_69 对齐：月卡额度 8700 立即到账，签到 50×38=1900 */
  dailyPlanMonthlyCredits: 10600,
  instantCredits: 8700,
  checkInCredits: 1900,
  priceYuan: 69,
  planTitle: "日常创作",
  /** 关闭后：当前登录会话内不再弹出（重新登录会清掉） */
  dismissStorageKey: "tai:canvas-summer-promo-dismiss:20260806",
  /** 显式登录后：允许再弹一次 */
  loginPendingStorageKey: "tai:canvas-summer-promo-login-pending:20260806",
  /** 活动期内购买过任意套餐：该用户不再弹出 */
  purchasedStorageKeyPrefix: "tai:canvas-summer-promo-purchased:20260806",
  /** 顶部倒计时横幅关闭：当前会话不再显示 */
  topBannerDismissStorageKey: "tai:canvas-summer-promo-top-banner-dismiss:20260806",
} as const;

/** 会员支付成功（任意套餐）时派发，海报宿主据此永久关闭 */
export const CANVAS_SUMMER_PROMO_PURCHASED_EVENT = "canvas-summer-promo-purchased";
export const CANVAS_SUMMER_PROMO_TOP_BANNER_DISMISS_EVENT =
  "canvas-summer-promo-top-banner-dismiss";

export function isCanvasSummerPromoActive(now = new Date()): boolean {
  const t = now.getTime();
  return t >= CANVAS_SUMMER_PROMO.start.getTime() && t <= CANVAS_SUMMER_PROMO.end.getTime();
}

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;
/** 剩余 ≤12 小时时切换为时分秒倒计时 */
export const CANVAS_SUMMER_PROMO_COUNTDOWN_HMS_THRESHOLD_MS = 12 * MS_HOUR;

export type CanvasSummerPromoCountdown =
  | { active: false; remainingMs: 0 }
  | {
      active: true;
      remainingMs: number;
      mode: "days";
      days: number;
      label: string;
    }
  | {
      active: true;
      remainingMs: number;
      mode: "hms";
      hours: number;
      minutes: number;
      seconds: number;
      label: string;
    };

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/** 活动倒计时：>12h 按天（向上取整），≤12h 用 HH:MM:SS */
export function getCanvasSummerPromoCountdown(
  now = new Date(),
): CanvasSummerPromoCountdown {
  const remainingMs = CANVAS_SUMMER_PROMO.end.getTime() - now.getTime();
  if (remainingMs <= 0 || now.getTime() < CANVAS_SUMMER_PROMO.start.getTime()) {
    return { active: false, remainingMs: 0 };
  }
  if (remainingMs <= CANVAS_SUMMER_PROMO_COUNTDOWN_HMS_THRESHOLD_MS) {
    const totalSec = Math.floor(remainingMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return {
      active: true,
      remainingMs,
      mode: "hms",
      hours,
      minutes,
      seconds,
      label: `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`,
    };
  }
  const days = Math.max(1, Math.ceil(remainingMs / MS_DAY));
  return {
    active: true,
    remainingMs,
    mode: "days",
    days,
    label: `${days}天`,
  };
}

export function getCanvasSummerPromoProgress(now = new Date()): number {
  const start = CANVAS_SUMMER_PROMO.start.getTime();
  const end = CANVAS_SUMMER_PROMO.end.getTime();
  if (now.getTime() <= start) return 0;
  if (now.getTime() >= end) return 1;
  return (now.getTime() - start) / (end - start);
}

function purchasedStorageKey(userId: string): string {
  return `${CANVAS_SUMMER_PROMO.purchasedStorageKeyPrefix}:${userId}`;
}

/** 关闭海报：本次登录内不再出现 */
export function dismissCanvasSummerPromo(): void {
  try {
    sessionStorage.setItem(CANVAS_SUMMER_PROMO.dismissStorageKey, "1");
    sessionStorage.removeItem(CANVAS_SUMMER_PROMO.loginPendingStorageKey);
  } catch {
    // ignore
  }
}

export function wasCanvasSummerPromoDismissed(): boolean {
  try {
    return sessionStorage.getItem(CANVAS_SUMMER_PROMO.dismissStorageKey) === "1";
  } catch {
    return false;
  }
}

/** 显式登录成功：清关闭标记，并挂起「登录后可再弹」 */
export function requestCanvasSummerPromoOnLogin(): void {
  if (!isCanvasSummerPromoActive()) return;
  try {
    sessionStorage.removeItem(CANVAS_SUMMER_PROMO.dismissStorageKey);
    sessionStorage.setItem(CANVAS_SUMMER_PROMO.loginPendingStorageKey, "1");
  } catch {
    // ignore
  }
}

/** 退出登录：清会话关闭标记（下次登录由 requestCanvasSummerPromoOnLogin 挂起） */
export function clearCanvasSummerPromoSessionOnLogout(): void {
  try {
    sessionStorage.removeItem(CANVAS_SUMMER_PROMO.dismissStorageKey);
    sessionStorage.removeItem(CANVAS_SUMMER_PROMO.loginPendingStorageKey);
    sessionStorage.removeItem(CANVAS_SUMMER_PROMO.topBannerDismissStorageKey);
  } catch {
    // ignore
  }
}

export function hasCanvasSummerPromoLoginPending(): boolean {
  try {
    return sessionStorage.getItem(CANVAS_SUMMER_PROMO.loginPendingStorageKey) === "1";
  } catch {
    return false;
  }
}

export function clearCanvasSummerPromoLoginPending(): void {
  try {
    sessionStorage.removeItem(CANVAS_SUMMER_PROMO.loginPendingStorageKey);
  } catch {
    // ignore
  }
}

/** 活动期内买过任意套餐的用户，整段活动不再弹 */
export function markCanvasSummerPromoPurchased(userId: string): void {
  if (!userId) return;
  try {
    localStorage.setItem(purchasedStorageKey(userId), "1");
  } catch {
    // ignore
  }
}

export function hasCanvasSummerPromoPurchased(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(purchasedStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

/**
 * 是否应展示海报（不含「已是会员」的异步判断，由宿主再查 entitlement）
 * - 活动未开始/已结束 → 否
 * - 该用户活动期内买过套餐 → 否
 * - 本会话已关闭且非「登录后挂起」→ 否
 */
export function shouldShowCanvasSummerPromo(userId?: string | null): boolean {
  if (!isCanvasSummerPromoActive()) return false;
  if (hasCanvasSummerPromoPurchased(userId)) return false;
  if (hasCanvasSummerPromoLoginPending()) return true;
  if (wasCanvasSummerPromoDismissed()) return false;
  return true;
}

export function dismissCanvasSummerPromoTopBanner(): void {
  try {
    sessionStorage.setItem(CANVAS_SUMMER_PROMO.topBannerDismissStorageKey, "1");
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CANVAS_SUMMER_PROMO_TOP_BANNER_DISMISS_EVENT));
  }
}

export function wasCanvasSummerPromoTopBannerDismissed(): boolean {
  try {
    return sessionStorage.getItem(CANVAS_SUMMER_PROMO.topBannerDismissStorageKey) === "1";
  } catch {
    return false;
  }
}

export function shouldShowCanvasSummerPromoTopBanner(now = new Date()): boolean {
  if (!isCanvasSummerPromoActive(now)) return false;
  if (!getCanvasSummerPromoCountdown(now).active) return false;
  if (wasCanvasSummerPromoTopBannerDismissed()) return false;
  return true;
}
