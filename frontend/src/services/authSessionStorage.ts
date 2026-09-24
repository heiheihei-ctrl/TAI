import { ACCESS_TOKEN_TTL_MS } from "./authTokenConfig";

const LS_TOKEN_EXPIRY = "token_expiry";
const LS_LAST_AUTH_AT = "last_auth_at";

export function getStoredTokenExpiry(): number | null {
  try {
    const expiryRaw = localStorage.getItem(LS_TOKEN_EXPIRY);
    if (!expiryRaw) return null;
    let expiry = parseInt(expiryRaw, 10);
    if (!Number.isFinite(expiry)) return null;

    const lastAuth = getStoredLastAuthAt();
    if (lastAuth && Number.isFinite(lastAuth) && Date.now() - lastAuth > ACCESS_TOKEN_TTL_MS) {
      clearStoredTokenExpiry();
      return null;
    }

    const maxByAuth =
      lastAuth && Number.isFinite(lastAuth)
        ? lastAuth + ACCESS_TOKEN_TTL_MS
        : Date.now() + ACCESS_TOKEN_TTL_MS;
    if (expiry > maxByAuth) {
      expiry = maxByAuth;
      setStoredTokenExpiry(expiry);
    }
    return expiry;
  } catch {
    return null;
  }
}

export function setStoredTokenExpiry(expiry: number) {
  try {
    localStorage.setItem(LS_TOKEN_EXPIRY, expiry.toString());
  } catch {}
}

export function clearStoredTokenExpiry() {
  try {
    localStorage.removeItem(LS_TOKEN_EXPIRY);
  } catch {}
}

export function getStoredLastAuthAt(): number | null {
  try {
    const raw = localStorage.getItem(LS_LAST_AUTH_AT);
    return raw ? parseInt(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredLastAuthAt(ts: number) {
  try {
    localStorage.setItem(LS_LAST_AUTH_AT, ts.toString());
  } catch {}
}

export function clearStoredLastAuthAt() {
  try {
    localStorage.removeItem(LS_LAST_AUTH_AT);
  } catch {}
}

/** 刷新/登录成功后标记本地会话仍有效（与 JWT_ACCESS_TTL 对齐） */
export function markAuthSessionFresh() {
  const now = Date.now();
  setStoredTokenExpiry(now + ACCESS_TOKEN_TTL_MS);
  setStoredLastAuthAt(now);
}
