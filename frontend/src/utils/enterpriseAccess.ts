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

/** 优先 owner/admin，否则取第一个企业 */
export function pickPreferredEnterprise<
  T extends Pick<TeamInfo, "id" | "myRole" | "isPersonal" | "enterpriseEnabled">,
>(teams: T[]): T | null {
  const enterprises = pickEnterprises(teams);
  if (enterprises.length === 0) return null;
  return (
    enterprises.find((t) => t.myRole === "owner" || t.myRole === "admin") ||
    enterprises[0]
  );
}
