const CONTACT_POPUP_PENDING_KEY = "tai:contact-popup-pending";
const CONTACT_POPUP_SHOWN_DAY_KEY = "tai:contact-popup-shown-day";

export function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 显式登录成功后调用：要求进画布时自动弹一次 */
export function requestContactPopupOnNextEnter(): void {
  try {
    window.localStorage.setItem(CONTACT_POPUP_PENDING_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function shouldAutoShowContactPopup(): boolean {
  try {
    if (window.localStorage.getItem(CONTACT_POPUP_PENDING_KEY) === "1") {
      return true;
    }
    return (
      window.localStorage.getItem(CONTACT_POPUP_SHOWN_DAY_KEY) !==
      getLocalDateKey()
    );
  } catch {
    return true;
  }
}

/** 真正弹出后再标记，避免认证 init 闪屏挂载时误标记 */
export function markContactPopupShown(): void {
  try {
    window.localStorage.removeItem(CONTACT_POPUP_PENDING_KEY);
    window.localStorage.setItem(CONTACT_POPUP_SHOWN_DAY_KEY, getLocalDateKey());
  } catch {
    /* ignore */
  }
}

/** 退出登录：清当天记录并挂起，确保下次登录必弹 */
export function clearContactPopupShownDay(): void {
  try {
    window.localStorage.removeItem(CONTACT_POPUP_SHOWN_DAY_KEY);
    window.localStorage.setItem(CONTACT_POPUP_PENDING_KEY, "1");
    window.localStorage.removeItem("tai:contact-popup-shown");
    window.localStorage.removeItem("tai:contact-popup-login-at");
  } catch {
    /* ignore */
  }
}
