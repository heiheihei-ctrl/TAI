/** 团队邀请码前缀（与推荐码 TAI-XXXX 区分） */
export const TEAM_INVITE_PREFIX = 'tai_';

const TEAM_INVITE_CODE_RE = /^tai_[A-Za-z0-9_-]+$/;

/** 从粘贴内容或 URL 中解析团队邀请码 */
export function parseTeamInviteCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (TEAM_INVITE_CODE_RE.test(trimmed)) {
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
    if (code && TEAM_INVITE_CODE_RE.test(code)) {
      return code;
    }
  } catch {
    // ignore invalid URL
  }

  return null;
}

export function isTeamInviteQueryParam(code: string | null): boolean {
  return !!code && TEAM_INVITE_CODE_RE.test(code);
}
