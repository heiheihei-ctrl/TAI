import { useAuthStore } from "@/stores/authStore";

// 防止 auth-invalid 事件重复触发
let lastAuthInvalidTime = 0;
const AUTH_INVALID_DEBOUNCE_MS = 3000; // 3秒内不重复触发

export function triggerAuthInvalid(reason = "登录凭证无效，请重新登录") {
  const now = Date.now();
  if (now - lastAuthInvalidTime < AUTH_INVALID_DEBOUNCE_MS) {
    return;
  }
  lastAuthInvalidTime = now;

  try {
    window.dispatchEvent(new CustomEvent("auth-invalid"));
  } catch {}

  try {
    useAuthStore.getState().forceLogout(reason);
  } catch (error) {
    console.warn("triggerAuthInvalid: failed to force logout", error);
  }
}

