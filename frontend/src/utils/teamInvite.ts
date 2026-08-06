/** 团队邀请码前缀（与推荐码 TAI-XXXX 区分） */
export const TEAM_INVITE_PREFIX = 'tai_';

const TEAM_INVITE_CODE_RE = /^tai_[A-Za-z0-9_-]+$/;

const PENDING_TEAM_INVITE_KEY = 'tai_pending_team_invite';

export function isTeamInviteQueryParam(code: string | null | undefined): boolean {
  if (!code) return false;
  if (TEAM_INVITE_CODE_RE.test(code)) return true;
  // 兼容历史无前缀邀请码
  return /^[A-Za-z0-9_-]{8,64}$/.test(code);
}

/** 从粘贴内容或 URL 中解析团队邀请码 */
export function parseTeamInviteCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (isTeamInviteQueryParam(trimmed)) {
    return trimmed;
  }

  try {
    const asUrl = trimmed.includes('://')
      ? new URL(trimmed)
      : new URL(trimmed.startsWith('?') ? `https://local${trimmed}` : `https://local/?${trimmed}`);
    const code =
      asUrl.searchParams.get('inviteCode') ||
      asUrl.searchParams.get('teamInvite') ||
      asUrl.searchParams.get('team_invite');
    if (code && isTeamInviteQueryParam(code)) {
      return code;
    }
  } catch {
    // ignore invalid URL
  }

  return null;
}

export function resolveTeamInviteFromSearchParams(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): string | null {
  const raw =
    searchParams.get('inviteCode') ||
    searchParams.get('teamInvite') ||
    searchParams.get('team_invite');
  return isTeamInviteQueryParam(raw) ? raw : null;
}

/** 登录跳转等场景保留邀请码，避免落到 /app 后弹窗丢失 */
export function stashPendingTeamInvite(code: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (!isTeamInviteQueryParam(code)) return;
  try {
    sessionStorage.setItem(PENDING_TEAM_INVITE_KEY, code as string);
  } catch {
    // ignore quota / private mode
  }
}

export function peekPendingTeamInvite(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const code = sessionStorage.getItem(PENDING_TEAM_INVITE_KEY);
    return isTeamInviteQueryParam(code) ? code : null;
  } catch {
    return null;
  }
}

export function clearPendingTeamInvite(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_TEAM_INVITE_KEY);
  } catch {
    // ignore
  }
}

/** 首页带邀请参数的落地地址（登录后优先回这里弹确认窗） */
export function buildTeamInviteHomePath(code: string): string {
  return `/?teamInvite=${encodeURIComponent(code)}`;
}

/** URL 参数或本地暂存的邀请码 */
export function resolveActiveTeamInvite(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): string | null {
  return resolveTeamInviteFromSearchParams(searchParams) || peekPendingTeamInvite();
}
