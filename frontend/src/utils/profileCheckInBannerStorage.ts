import { getLocalDateKey } from "@/utils/contactPopupStorage";

const PENDING_KEY = "tai:profile-checkin-banner-pending";
const SHOWN_DAY_KEY = "tai:profile-checkin-banner-shown-day";
const PERMANENT_DISMISS_PREFIX = "tai:profile-checkin-banner-permanent-dismiss:";

function permanentDismissKey(userId: string): string {
  return `${PERMANENT_DISMISS_PREFIX}${userId}`;
}

/** 显式登录成功后调用：要求进画布时自动展示一次 */
export function requestProfileCheckInBannerOnNextEnter(): void {
  try {
    window.localStorage.setItem(PENDING_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function shouldAutoShowProfileCheckInBanner(): boolean {
  try {
    if (window.localStorage.getItem(PENDING_KEY) === "1") {
      return true;
    }
    return window.localStorage.getItem(SHOWN_DAY_KEY) !== getLocalDateKey();
  } catch {
    return true;
  }
}

/** 真正展示后再标记，避免认证 init 闪屏挂载时误标记 */
export function markProfileCheckInBannerShown(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY);
    window.localStorage.setItem(SHOWN_DAY_KEY, getLocalDateKey());
  } catch {
    /* ignore */
  }
}

/** 退出登录：清当天记录并挂起，确保下次登录必展示 */
export function clearProfileCheckInBannerShownDay(): void {
  try {
    window.localStorage.removeItem(SHOWN_DAY_KEY);
    window.localStorage.setItem(PENDING_KEY, "1");
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

/** 注册满 3 天仍未完善资料时永久不再展示 */
export function markProfileCheckInBannerPermanentlyDismissed(userId: string): void {
  try {
    window.localStorage.setItem(permanentDismissKey(userId), "1");
  } catch {
    /* ignore */
  }
}
