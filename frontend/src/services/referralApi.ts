import { fetchWithAuth } from "./authFetch";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  "http://localhost:4000";

const buildUrl = (path: string) => {
  const base = API_BASE.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${base}/${p}`;
};

async function request(path: string, options: RequestInit = {}) {
  const response = await fetchWithAuth(buildUrl(path), options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "请求失败");
  }
  return response;
}

// 邀请记录
export interface InviteRecord {
  id: string;
  inviteeName: string;
  inviteePhone: string;
  createdAt: string;
  rewardStatus: "pending" | "rewarded";
  rewardAmount: number;
  rewardedAt: string | null;
}

// 推广统计
export interface ReferralStats {
  inviteCode: string;
  inviteLink: string;
  successfulInvites: number;
  totalEarnings: number;
  inviteRecords: InviteRecord[];
}

// 签到状态
export interface CheckInStatus {
  consecutiveDays: number;
  lastCheckInDate: string | null;
  canCheckIn: boolean;
  todayReward: number;
  weeklyBonus: number;
  rewards: number[];
}

const CHECK_IN_REMINDER_BANNER_DISMISSED_KEY =
  "tanva-check-in-reminder-banner-dismissed-date";

function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 连续 7 天已签到并领取奖励后不再显示提醒 */
export function shouldHideCheckInReminder(status: CheckInStatus): boolean {
  return status.consecutiveDays >= 7 && !status.canCheckIn;
}

/** 今日是否已关闭签到提醒条 */
export function isCheckInReminderBannerDismissedToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(CHECK_IN_REMINDER_BANNER_DISMISSED_KEY);
    if (!raw) return false;
    return raw === getLocalDateKey();
  } catch {
    return false;
  }
}

/** 关闭签到提醒条（仅当日有效） */
export function dismissCheckInReminderBannerForToday(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CHECK_IN_REMINDER_BANNER_DISMISSED_KEY,
      getLocalDateKey(),
    );
  } catch {
    // ignore
  }
}

/** 登录时清理过期的关闭缓存 */
export function normalizeCheckInReminderBannerDismissCache(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(CHECK_IN_REMINDER_BANNER_DISMISSED_KEY);
    if (!raw) return;
    if (raw !== getLocalDateKey()) {
      window.localStorage.removeItem(CHECK_IN_REMINDER_BANNER_DISMISSED_KEY);
    }
  } catch {
    // ignore
  }
}

// 签到结果
export interface CheckInResult {
  success: boolean;
  consecutiveDays: number;
  reward: number;
  newBalance: number;
  isWeeklyBonus: boolean;
}

// 获取推广统计
export async function getReferralStats(): Promise<ReferralStats> {
  const response = await request("/api/referral/stats");
  return response.json();
}

// 获取签到状态
export async function getCheckInStatus(): Promise<CheckInStatus> {
  const response = await request("/api/referral/check-in/status");
  return response.json();
}

// 执行签到
export async function checkIn(): Promise<CheckInResult> {
  const response = await request("/api/referral/check-in", {
    method: "POST",
  });
  return response.json();
}

// 验证邀请码
export async function validateInviteCode(
  code: string
): Promise<{ valid: boolean; inviterName?: string; message?: string }> {
  const response = await fetch(buildUrl(`/api/referral/validate-code?code=${encodeURIComponent(code)}`));
  return response.json();
}

// 使用邀请码
export async function useInviteCode(code: string): Promise<any> {
  const response = await request("/api/referral/use-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return response.json();
}
