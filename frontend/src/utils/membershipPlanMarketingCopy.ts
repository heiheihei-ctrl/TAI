import type { PaymentMembershipPlan } from "@/services/adminApi";
import { resolveMonthlyListPrice } from "@/utils/membershipYearlyDisplay";

export type PlanMarketingCopy = {
  /** 预计合计积分（套餐年/月额度 + 签到） */
  totalCredits: number;
  /** 合计积分下方三条描述 */
  lines: [string, string, string];
};

type TierKey = 69 | 199 | 599;

/** 月付：立即到账 = 月卡+档位赠送；签到 = daily×30 + 连签额外×4 */
const MONTHLY_COPY: Record<TierKey, PlanMarketingCopy> = {
  69: {
    totalCredits: 10600,
    lines: [
      "套餐立即到账8700积分（每日签到共奖励1900积分）",
      "至多生成353张图片",
      "或26个视频",
    ],
  },
  199: {
    totalCredits: 25800,
    lines: [
      "套餐立即到账22000积分（每日签到共奖励3800积分）",
      "至多生成860张图片",
      "或64个视频",
    ],
  },
  599: {
    totalCredits: 74700,
    lines: [
      "套餐立即到账69000积分（每日签到共奖励5700积分）",
      "至多生成2490张图片",
      "或186个视频",
    ],
  },
};

/**
 * 年付展示：套餐按 12×月立即到账估算 + 全年签到（daily×365 + 连签额外×52）
 * 图片/视频上限按合计÷约 30 / 约 400 估算
 */
const YEARLY_COPY: Record<TierKey, PlanMarketingCopy> = {
  69: {
    totalCredits: 127850,
    lines: [
      "套餐立即到账104400积分（每日签到共奖励23450积分）",
      "至多生成4261张图片",
      "或319个视频",
    ],
  },
  199: {
    totalCredits: 310900,
    lines: [
      "套餐立即到账264000积分（每日签到共奖励46900积分）",
      "至多生成10363张图片",
      "或777个视频",
    ],
  },
  599: {
    totalCredits: 898350,
    lines: [
      "套餐立即到账828000积分（每日签到共奖励70350积分）",
      "至多生成29945张图片",
      "或2245个视频",
    ],
  },
};

export function getPlanMarketingCopy(
  plan: PaymentMembershipPlan,
): PlanMarketingCopy | null {
  const tier = resolveMonthlyListPrice(plan) as TierKey | null;
  if (tier !== 69 && tier !== 199 && tier !== 599) return null;
  if (plan.billingCycle === "yearly") return YEARLY_COPY[tier];
  if (plan.billingCycle === "monthly") return MONTHLY_COPY[tier];
  return null;
}
