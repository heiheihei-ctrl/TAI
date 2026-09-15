import type { PaymentMembershipPlan } from "@/services/adminApi";
import { resolveMonthlyListPrice } from "@/utils/membershipYearlyDisplay";

export type PlanMarketingCopy = {
  /** 预计合计积分套餐年/月额度 + 签到 */
  totalCredits: number;
  monthlyPackageCredits: number;
  weeklyExtraCredits: number;
  /** 合计积分下方描述行每项独占一行 */
  lines: string[];
};

type TierKey = 69 | 199 | 599;

/** 月付：立即到账 = 月卡额度；签到 = daily×30 + 连签额外×4 */
const MONTHLY_COPY: Record<TierKey, PlanMarketingCopy> = {
  69: {
    totalCredits: 9250,
    monthlyPackageCredits: 7350,
    weeklyExtraCredits: 100,
    lines: [
      "套餐到账 7350积分",
      "每日签到50积分 第7天+100积分",
      "全月积分至多生成308张图片",
      "或23个视频",
    ],
  },
  199: {
    totalCredits: 25800,
    monthlyPackageCredits: 22000,
    weeklyExtraCredits: 200,
    lines: [
      "套餐立即到账22000积分",
      "每日签到100积分 第7天+200积分",
      "全月积分至多生成860张图片",
      "或64个视频",
    ],
  },
  599: {
    totalCredits: 74700,
    monthlyPackageCredits: 69000,
    weeklyExtraCredits: 300,
    lines: [
      "套餐立即到账69000积分",
      "每日签到150积分 第7天+300积分",
      "全月积分至多生成2490张图片",
      "或186个视频",
    ],
  },
};

/**
 * 年付展示全年合计，套餐积分仍按月发放：
 * 套餐 = 月立即到账 × 12；签到 = daily×365 + 连签额外×52
 * 左→右：日常 7350 / 专业 22000 / 旗舰 69000
 */
const YEARLY_COPY: Record<TierKey, PlanMarketingCopy> = {
  69: {
    totalCredits: 111650,
    monthlyPackageCredits: 7350,
    weeklyExtraCredits: 100,
    lines: [
      "套餐积分：全年 88200，开通当月发 7350，后续每月发 1/12",
      "每日签到50积分 第7天+100积分",
      "全年积分至多生成3721张图片",
      "或279个视频",
    ],
  },
  199: {
    totalCredits: 310900,
    monthlyPackageCredits: 22000,
    weeklyExtraCredits: 200,
    lines: [
      "套餐积分：全年 264000，开通当月发 22000，后续每月发 1/12",
      "每日签到100积分 第7天+200积分",
      "全年积分至多生成10363张图片",
      "或777个视频",
    ],
  },
  599: {
    totalCredits: 898350,
    monthlyPackageCredits: 69000,
    weeklyExtraCredits: 300,
    lines: [
      "套餐积分：全年 828000，开通当月发 69000，后续每月发 1/12",
      "每日签到150积分 第7天+300积分",
      "全年积分至多生成29945张图片",
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
