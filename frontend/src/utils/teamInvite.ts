/** 团队邀请码前缀（与推荐码 TAI-XXXX 区分） */
export const TEAM_INVITE_PREFIX = 'tai_';

const TEAM_INVITE_CODE_RE = /^tai_[A-Za-z0-9_-]+$/;

export function isTeamInviteQueryParam(code: string | null): boolean {
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
