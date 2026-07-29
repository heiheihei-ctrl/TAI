import { fetchWithAuth } from "./authFetch";
import { getAccessAuthHeader } from "./authTokenStorage";
import { getApiBaseUrl } from "../utils/assetProxy";

export type ExtendedProfile = {
  realName: string | null;
  nickname: string | null;
  gender: string | null;
  birthday: string | null;
  email: string | null;
  occupation: string | null;
  company: string | null;
  region: string | null;
  sourceChannel: string | null;
  isComplete: boolean;
  rewardClaimed: boolean;
  rewardCredits: number;
  completedAt: string | null;
};

export type UpdateExtendedProfilePayload = {
  realName: string;
  nickname: string;
  gender: "male" | "female" | "other";
  birthday: string;
  email: string;
  occupation: string;
  company: string;
  region: string;
  sourceChannel?: string | null;
};

export type UpdateExtendedProfileResult = {
  profile: ExtendedProfile;
  rewardGranted: boolean;
  rewardCredits: number;
};

const base = () => getApiBaseUrl();

export type FetchExtendedProfileOptions = {
  /** 登录后立即拉取时可开启，避免 token 尚未就绪时 401 被当作登出 */
  allowRefresh?: boolean;
};

export async function fetchExtendedProfile(
  options: FetchExtendedProfileOptions = {},
): Promise<ExtendedProfile> {
  const { allowRefresh = false } = options;
  const response = await fetchWithAuth(`${base()}/api/users/extended-profile`, {
    credentials: "include",
    auth: "omit",
    allowRefresh,
    headers: { ...getAccessAuthHeader() },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }
  const payload = await response.json();
  return payload.profile as ExtendedProfile;
}

export async function updateExtendedProfile(
  payload: UpdateExtendedProfilePayload,
): Promise<UpdateExtendedProfileResult> {
  const response = await fetchWithAuth(`${base()}/api/users/extended-profile`, {
    method: "PATCH",
    credentials: "include",
    auth: "omit",
    allowRefresh: false,
    headers: {
      "Content-Type": "application/json",
      ...getAccessAuthHeader(),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export const PROFILE_COMPLETION_BANNER_DISMISSED_KEY =
  "tanva-profile-completion-banner-dismissed";

const LEGACY_PERMANENT_DISMISS = "1";

function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 今日是否已关闭完善资料提示条 */
export function isProfileCompletionBannerDismissedToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(PROFILE_COMPLETION_BANNER_DISMISSED_KEY);
    if (!raw || raw === LEGACY_PERMANENT_DISMISS) return false;
    return raw === getLocalDateKey();
  } catch {
    return false;
  }
}

/** 关闭提示条（仅当日有效），并清除旧的永久关闭缓存 */
export function dismissProfileCompletionBannerForToday(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROFILE_COMPLETION_BANNER_DISMISSED_KEY);
    window.localStorage.setItem(PROFILE_COMPLETION_BANNER_DISMISSED_KEY, getLocalDateKey());
  } catch {
    // ignore
  }
}

/** 清除完善资料提示条的关闭记录（资料已完善时可调用） */
export function clearProfileCompletionBannerDismissCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROFILE_COMPLETION_BANNER_DISMISSED_KEY);
  } catch {
    // ignore
  }
}

/** 登录时清理过期/旧版关闭缓存，确保跨天或旧数据不会误隐藏 */
export function normalizeProfileCompletionBannerDismissCache(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PROFILE_COMPLETION_BANNER_DISMISSED_KEY);
    if (!raw) return;
    if (raw === LEGACY_PERMANENT_DISMISS || raw !== getLocalDateKey()) {
      window.localStorage.removeItem(PROFILE_COMPLETION_BANNER_DISMISSED_KEY);
    }
  } catch {
    // ignore
  }
}

export const DEFAULT_INCOMPLETE_PROFILE: ExtendedProfile = {
  realName: null,
  nickname: null,
  gender: null,
  birthday: null,
  email: null,
  occupation: null,
  company: null,
  region: null,
  sourceChannel: null,
  isComplete: false,
  rewardClaimed: false,
  rewardCredits: 100,
  completedAt: null,
};

export const OPEN_SETTINGS_SECTION_EVENT = "tanva-open-settings-section";
export const PENDING_SETTINGS_SECTION_KEY = "tanva-pending-settings-section";

export function queueOpenSettingsSection(section: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_SETTINGS_SECTION_KEY, section);
  } catch {
    // ignore
  }
}

export function takePendingSettingsSection(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const section = window.sessionStorage.getItem(PENDING_SETTINGS_SECTION_KEY);
    if (section) {
      window.sessionStorage.removeItem(PENDING_SETTINGS_SECTION_KEY);
    }
    return section;
  } catch {
    return null;
  }
}

export function openSettingsSection(section: string) {
  queueOpenSettingsSection(section);
  window.dispatchEvent(
    new CustomEvent(OPEN_SETTINGS_SECTION_EVENT, { detail: { section } }),
  );
}
