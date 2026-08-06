import type { TeamInfo } from "@/stores/teamStore";

/** 用户所属的企业工作区（非个人且企业能力开启） */
export function pickEnterprises<T extends Pick<TeamInfo, "isPersonal" | "enterpriseEnabled">>(
  teams: T[],
): T[] {
  return teams.filter((t) => !t.isPersonal && t.enterpriseEnabled !== false);
}

export function isEnterpriseMember(teams: Pick<TeamInfo, "isPersonal" | "enterpriseEnabled">[]): boolean {
  return pickEnterprises(teams).length > 0;
}

export function canAccessEnterpriseConsole(
  team: Pick<TeamInfo, "myRole"> | null | undefined,
): boolean {
  return team?.myRole === "owner" || team?.myRole === "admin";
}

/** 可进入企业后台的企业（仅 owner/admin；member 不可进后台） */
export function pickConsoleEnterprises<
  T extends Pick<TeamInfo, "id" | "myRole" | "isPersonal" | "enterpriseEnabled">,
>(teams: T[]): T[] {
  return pickEnterprises(teams).filter((t) => canAccessEnterpriseConsole(t));
}

/** 优先 owner，否则第一个可进后台的企业 */
export function pickPreferredEnterprise<
  T extends Pick<TeamInfo, "id" | "myRole" | "isPersonal" | "enterpriseEnabled">,
>(teams: T[]): T | null {
  const enterprises = pickConsoleEnterprises(teams);
  if (enterprises.length === 0) return null;
  return enterprises.find((t) => t.myRole === "owner") || enterprises[0];
}
