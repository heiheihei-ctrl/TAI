export const TEAM_ID_HEADER = 'x-team-id';

export function extractTeamIdFromRequest(
  req: { headers?: Record<string, string | string[] | undefined> } | null | undefined,
): string | undefined {
  if (!req?.headers) return undefined;
  const headers = req.headers;
  const raw =
    headers[TEAM_ID_HEADER] ??
    headers['X-Team-Id'] ??
    headers['x-team-id'];
  if (Array.isArray(raw)) {
    const first = raw[0]?.trim();
    return first || undefined;
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return undefined;
}
