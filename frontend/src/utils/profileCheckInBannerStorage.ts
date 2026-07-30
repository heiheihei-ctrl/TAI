import { getLocalDateKey } from "@/utils/contactPopupStorage";

const SHOWN_DAY_KEY = "tai:profile-checkin-banner-shown-day";
const PERMANENT_DISMISS_PREFIX = "tai:profile-checkin-banner-permanent-dismiss:";

function permanentDismissKey(userId: string): string {
  return `${PERMANENT_DISMISS_PREFIX}${userId}`;
}

/** 今天是否已经展示过（含自动淡出 / 手动关闭） */
export function shouldAutoShowProfileCheckInBanner(): boolean {
  try {
    return window.localStorage.getItem(SHOWN_DAY_KEY) !== getLocalDateKey();
  } catch {
    return true;
  }
}

/** 真正展示后再标记，当天刷新不再出现 */
export function markProfileCheckInBannerShown(): void {
  try {
    window.localStorage.setItem(SHOWN_DAY_KEY, getLocalDateKey());
  } catch {
    /* ignore */
  }
}

export function isProfileCheckInBannerPermanentlyDismissed(
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  try {
    return window.localStorage.getItem(permanentDismissKey(userId)) === "1";
  } catch {
    return false;
  }
}

/** 注册满 3 天仍未完善资料 → 永久不再展示整条广告 */
export function isProfileBannerGraceExpired(
  createdAt: string | null | undefined,
  isComplete: boolean,
): boolean {
  if (isComplete || !createdAt) return false;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const graceMs = 3 * 24 * 60 * 60 * 1000;
  return Date.now() - created.getTime() >= graceMs;
}

export function markProfileCheckInBannerPermanentlyDismissed(userId: string): void {
  try {
    window.localStorage.setItem(permanentDismissKey(userId), "1");
  } catch {
    /* ignore */
  }
}

/** 资料已完善后清除永久标记，签到提醒可继续按日展示 */
export function clearProfileCheckInBannerPermanentDismiss(userId: string): void {
  try {
    window.localStorage.removeItem(permanentDismissKey(userId));
  } catch {
    /* ignore */
  }
}
