import { triggerAuthInvalid } from './authEvents';
import { getAccessToken, getRefreshAuthHeader, getAuthSessionSignature, setTokens } from './authTokenStorage';
import { ensureTraceHeader } from '../utils/trace';
import { getBillingTeamId } from '@/stores/teamStore';
import { notifyCreditsChanged } from '@/utils/creditsEvents';

type RequestInput = RequestInfo | URL;

export type AuthFetchInit = RequestInit & {
  auth?: "auto" | "omit";
  allowRefresh?: boolean;
};

let refreshPromise: Promise<boolean | null> | null = null;

const SAFE_URL_BASE = "http://localhost";
const CREDITS_AFFECTING_PATH_PATTERNS = [
  "/api/ai/",
  "/video-gif/convert",
];

/** 仅创建异步任务、积分在 worker 里才预扣 —— 此时刷新会拿到旧余额 */
const CREDITS_DEDUCT_DEFERRED_PATH_PATTERNS = [
  "/api/ai/generate-image-async",
  "/api/ai/edit-image-async",
  "/api/ai/blend-images-async",
];

const isCreditsAffectingPath = (path: string): boolean =>
  CREDITS_AFFECTING_PATH_PATTERNS.some((pattern) => path.includes(pattern));

const isDeferredCreditsDeductPath = (path: string): boolean =>
  CREDITS_DEDUCT_DEFERRED_PATH_PATTERNS.some((pattern) => path.includes(pattern));

const resolveRequestUrl = (input: RequestInput): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  return String(input);
};

const resolveRequestMethod = (
  input: RequestInput,
  normalized: RequestInit
): string => {
  if (normalized.method) return String(normalized.method).toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request && input.method) {
    return input.method.toUpperCase();
  }
  return "GET";
};

const shouldNotifyCreditsRefresh = (
  input: RequestInput,
  normalized: RequestInit,
  response: Response
): boolean => {
  if (!response.ok) return false;

  const method = resolveRequestMethod(input, normalized);
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false;
  }

  const rawUrl = resolveRequestUrl(input);
  try {
    const parsed = new URL(
      rawUrl,
      typeof window !== "undefined" ? window.location.origin : SAFE_URL_BASE
    );
    if (isDeferredCreditsDeductPath(parsed.pathname)) return false;
    return isCreditsAffectingPath(parsed.pathname);
  } catch {
    if (isDeferredCreditsDeductPath(rawUrl)) return false;
    return isCreditsAffectingPath(rawUrl);
  }
};

const notifyCreditsRefreshIfNeeded = (
  input: RequestInput,
  normalized: RequestInit,
  response: Response
) => {
  if (!shouldNotifyCreditsRefresh(input, normalized, response)) return;
  notifyCreditsChanged();
};

const refreshUrl =
  import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim().length > 0
    ? `${import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "")}/api/auth/refresh`
    : "/api/auth/refresh";

async function ensureRefresh(): Promise<boolean | null> {
  if (!refreshPromise) {
    const sessionSignature = getAuthSessionSignature();
    refreshPromise = fetch(refreshUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { ...getRefreshAuthHeader() },
    })
      .then((res) => {
        if (sessionSignature !== getAuthSessionSignature()) return null;
        if (res.ok) {
          return res
            .json()
            .catch(() => null)
            .then((data) => {
              if (sessionSignature !== getAuthSessionSignature()) return null;
              if (data?.tokens) {
                setTokens(data.tokens);
              }
              return true;
            });
        }
        // 网络/服务异常不代表凭证失效；只有认证明确拒绝才退出。
        return res.status === 401 ? false : null;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function confirmAuthInvalid(): Promise<void> {
  const signature = getAuthSessionSignature();
  const token = getAccessToken();
  try {
    // Business/upstream 401 responses are not proof that the site's login is invalid.
    const response = await fetch(refreshUrl.replace(/\/refresh$/, '/me'), {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (response.status === 401 && signature === getAuthSessionSignature()) triggerAuthInvalid();
  } catch {
    // Retain permanent credentials on network/service failures.
  }
}

const normalizeInit = (init?: AuthFetchInit): RequestInit => {
  const { auth, ...rest } = init || {};
  const headers = new Headers(rest.headers || {});
  const authMode = auth ?? "auto";
  ensureTraceHeader(headers);

  if (authMode !== "omit") {
    const accessToken = getAccessToken();
    const currentAuth = headers.get("Authorization");
    if (!currentAuth && accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  const billingTeamId = getBillingTeamId();
  if (billingTeamId && !headers.has("X-Team-Id")) {
    headers.set("X-Team-Id", billingTeamId);
  }

  const credentials =
    rest.credentials ?? (authMode === "omit" ? "omit" : "include");

  return {
    ...rest,
    credentials,
    headers,
  };
};

export async function fetchWithAuth(
  input: RequestInput,
  init?: AuthFetchInit
): Promise<Response> {
  const { allowRefresh = true, auth = "auto", ...rest } = init || {};
  const rawUrl = resolveRequestUrl(input).trim().toLowerCase();
  if (rawUrl.startsWith("blob:")) {
    return new Response(null, { status: 410, statusText: "blob-url-skipped" });
  }
  if (rawUrl.startsWith("data:")) {
    const directInit: RequestInit = {
      ...rest,
      credentials: "omit",
    };
    return fetch(input, directInit);
  }
  const normalized = normalizeInit({ ...rest, auth });
  const sessionSignature = getAuthSessionSignature();
  const requestToken = getAccessToken();
  const response = await fetch(input, normalized);
  if (response.status === 403) {
    notifyCreditsRefreshIfNeeded(input, normalized, response);
    return response;
  }

  if (response.status !== 401) {
    notifyCreditsRefreshIfNeeded(input, normalized, response);
    return response;
  }

  if (auth === "omit") {
    return response;
  }
  if (sessionSignature !== getAuthSessionSignature()) return response;

  if (!allowRefresh) {
    await confirmAuthInvalid();
    return response;
  }

  const refreshed = await ensureRefresh();
  if (refreshed) {
    const retryHeaders = new Headers(rest.headers || {});
    if (requestToken && new Headers(normalized.headers).get('Authorization') === `Bearer ${requestToken}`) {
      retryHeaders.delete('Authorization');
    }
    const retryNormalized = normalizeInit({ ...rest, headers: retryHeaders, auth });
    const retryResponse = await fetch(input, retryNormalized);
    // 业务/上游服务也可能返回 401；再次由本站认证接口确认，避免误退出。
    if (retryResponse.status === 401) {
      await confirmAuthInvalid();
    }
    notifyCreditsRefreshIfNeeded(input, retryNormalized, retryResponse);
    return retryResponse;
  }

  if (refreshed === false) await confirmAuthInvalid();
  return response;
}
