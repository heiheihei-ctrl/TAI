import type { PaymentMembershipPlan } from "@/services/adminApi";

const YEARLY_BASE_DISCOUNT = 0.8;
const DAYS_PER_YEAR = 365;
const WEEKS_PER_YEAR = 52;
const DAYS_PER_MONTH = 30;
const WEEKS_PER_MONTH = 4;
const DEFAULT_STREAK_MULTIPLIER = 3;

function normPlanCode(code: string | undefined): string {
  return (code || "").trim().toLowerCase();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeStandardYearlyPrice(monthlyListPrice: number): number {
  return Math.round(monthlyListPrice * 12 * YEARLY_BASE_DISCOUNT);
}

export function resolveMonthlyListPrice(plan: PaymentMembershipPlan): number | null {
  const code = normPlanCode(plan.code);
  const name = (plan.name || "").trim();

  if (code.includes("599") || name.includes("旗舰")) return 599;
  if (code.includes("199") || name.includes("专业")) return 199;
  if (code.includes("69") || name.includes("日常")) return 69;

  return null;
}

/** 展示用签到积分（旗舰尊享设计稿为 150/天） */
function resolveDisplayDailyGiftCredits(plan: PaymentMembershipPlan): number {
  if (resolveMonthlyListPrice(plan) === 599) return 150;
  return Math.max(0, Math.trunc(plan.dailyGiftCredits || 0));
}

function resolveStreakMultiplier(plan: PaymentMembershipPlan): number {
  const metadata =
    plan.metadata && typeof plan.metadata === "object" && !Array.isArray(plan.metadata)
      ? plan.metadata
      : {};
  const multiplierRaw = metadata.consecutive7DayRewardMultiplier;
  if (typeof multiplierRaw === "number" && Number.isFinite(multiplierRaw) && multiplierRaw > 1) {
    return multiplierRaw;
  }
  return DEFAULT_STREAK_MULTIPLIER;
}

export type PlanCreditsBreakdown = {
  total: number;
  packageCredits: number;
  dailyPerDay: number;
  dailyMultiplier: number;
  dailyTotal: number;
  weeklyExtraPerWeek: number;
  weeklyMultiplier: number;
  weeklyTotal: number;
};

function buildPlanCreditsBreakdown(
  plan: PaymentMembershipPlan,
  period: { days: number; weeks: number },
): PlanCreditsBreakdown {
  const packageCredits = plan.monthlyQuotaCredits + plan.signupBonusCredits;
  const dailyPerDay = resolveDisplayDailyGiftCredits(plan);
  const streakMultiplier = resolveStreakMultiplier(plan);
  const weeklyExtraPerWeek = dailyPerDay * (streakMultiplier - 1);
  const dailyTotal = dailyPerDay * period.days;
  const weeklyTotal = weeklyExtraPerWeek * period.weeks;

  return {
    packageCredits,
    dailyPerDay,
    dailyMultiplier: period.days,
    dailyTotal,
    weeklyExtraPerWeek,
    weeklyMultiplier: period.weeks,
    weeklyTotal,
    total: packageCredits + dailyTotal + weeklyTotal,
  };
}

export type YearlyPlanDisplay = {
  displayPrice: number;
  equivMonthly: number | null;
};

/** @deprecated 使用 PlanCreditsBreakdown */
export type YearlyCreditsBreakdown = PlanCreditsBreakdown & { totalAnnual: number };

export function getYearlyPlanDisplay(plan: PaymentMembershipPlan): YearlyPlanDisplay | null {
  if (plan.billingCycle !== "yearly") return null;

  const monthlyListPrice = resolveMonthlyListPrice(plan);
  if (monthlyListPrice == null) return null;

  const displayPrice = computeStandardYearlyPrice(monthlyListPrice);
  return {
    displayPrice,
    equivMonthly: roundMoney(displayPrice / 12),
  };
}

export function getMonthlyCreditsBreakdown(
  plan: PaymentMembershipPlan,
): PlanCreditsBreakdown | null {
  if (plan.billingCycle !== "monthly") return null;
  return buildPlanCreditsBreakdown(plan, { days: DAYS_PER_MONTH, weeks: WEEKS_PER_MONTH });
}

export function getYearlyCreditsBreakdown(
  plan: PaymentMembershipPlan,
): PlanCreditsBreakdown | null {
  if (plan.billingCycle !== "yearly") return null;
  return buildPlanCreditsBreakdown(plan, { days: DAYS_PER_YEAR, weeks: WEEKS_PER_YEAR });
}

export function getPlanDisplayPrice(plan: PaymentMembershipPlan): number {
  const yearly = getYearlyPlanDisplay(plan);
  if (yearly) return yearly.displayPrice;
  return plan.price;
}
