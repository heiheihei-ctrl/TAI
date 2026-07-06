export interface PersonalTeamQuota {
  available: number | null;
  unlimited: boolean;
  teamBalance?: number | null;
  quotaRemaining?: number | null;
  creditQuotaMonthly: number | null;
  creditQuotaTotal: number | null;
  creditUsedThisCycle: number;
  creditUsedTotal: number;
}

/** 计算成员实际可用积分：个人分配剩余与团队积分池取较小值 */
export function computeMemberEffectiveAvailable(
  member: {
    creditQuotaMonthly?: number | null;
    creditQuotaTotal?: number | null;
    creditUsedThisCycle?: number;
    creditUsedTotal?: number;
  },
  teamBalance: number,
): number {
  const pool = Math.max(0, teamBalance);
  const monthly = member.creditQuotaMonthly;
  const total = member.creditQuotaTotal;
  const usedCycle = member.creditUsedThisCycle ?? 0;
  const usedTotal = member.creditUsedTotal ?? 0;
  const unlimited = monthly == null && total == null;

  if (unlimited) return pool;

  const caps: number[] = [];
  if (monthly != null) caps.push(Math.max(0, monthly - usedCycle));
  if (total != null) caps.push(Math.max(0, total - usedTotal));
  if (caps.length === 0) return pool;

  return Math.min(Math.min(...caps), pool);
}

/** Header 徽章：展示实际可用积分（分配额度 ∩ 团队积分池） */
export function formatPersonalQuotaBadge(quota: PersonalTeamQuota): {
  text: string;
  title: string;
} {
  const available = Math.max(0, quota.available ?? 0);
  const teamBalance = Math.max(0, quota.teamBalance ?? 0);
  const details: string[] = [`团队积分池 ${teamBalance.toLocaleString()}`];

  if (quota.unlimited) {
    details.unshift('个人分配：不限');
    return {
      text: available.toLocaleString(),
      title:
        teamBalance <= 0
          ? '团队积分池为空，暂无可消耗积分'
          : `个人配额不限，实际可用 ${available.toLocaleString()}（受团队积分池约束）\n${details.join('，')}`,
    };
  }

  if (quota.creditQuotaMonthly != null) {
    const remaining = Math.max(
      0,
      quota.creditQuotaMonthly - (quota.creditUsedThisCycle ?? 0),
    );
    details.push(
      `月度分配剩余 ${remaining.toLocaleString()} / ${quota.creditQuotaMonthly.toLocaleString()}`,
    );
  }
  if (quota.creditQuotaTotal != null) {
    const remaining = Math.max(
      0,
      quota.creditQuotaTotal - (quota.creditUsedTotal ?? 0),
    );
    details.push(
      `总量分配剩余 ${remaining.toLocaleString()} / ${quota.creditQuotaTotal.toLocaleString()}`,
    );
  }

  return {
    text: available.toLocaleString(),
    title: `实际可用 ${available.toLocaleString()}（分配剩余与团队积分池取较小值）\n${details.join('，')}`,
  };
}
