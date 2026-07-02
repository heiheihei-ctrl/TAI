import type { PaymentMembershipPlan } from "@/services/adminApi";

const YEARLY_LIMITED_EXTRA_DISCOUNT = 0.8;

function normPlanCode(code: string | undefined): string {
  return (code || "").trim().toLowerCase();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeStandardYearlyPrice(monthlyListPrice: number): number {
  return Math.round(monthlyListPrice * 12 * 0.8);
}

function resolveMonthlyListPrice(plan: PaymentMembershipPlan): number | null {
  const code = normPlanCode(plan.code);
  const name = (plan.name || "").trim();

  if (code.includes("599") || name.includes("旗舰")) return 599;
  if (code.includes("199") || name.includes("专业")) return 199;
  if (code.includes("69") || name.includes("日常")) return 69;

  return null;
}

export type YearlyPlanDisplay = {
  displayPrice: number;
  originalPrice: number | null;
  equivMonthly: number | null;
  showLimitedDiscountBadge: boolean;
};

export function getYearlyPlanDisplay(plan: PaymentMembershipPlan): YearlyPlanDisplay | null {
  if (plan.billingCycle !== "yearly") return null;

  const monthlyListPrice = resolveMonthlyListPrice(plan);
  if (monthlyListPrice == null) return null;

  const standardYearlyPrice = computeStandardYearlyPrice(monthlyListPrice);

  if (monthlyListPrice === 199) {
    const displayPrice = Math.round(standardYearlyPrice * YEARLY_LIMITED_EXTRA_DISCOUNT);
    return {
      displayPrice,
      originalPrice: standardYearlyPrice,
      equivMonthly: roundMoney(displayPrice / 12),
      showLimitedDiscountBadge: true,
    };
  }

  if (monthlyListPrice === 69) {
    return {
      displayPrice: standardYearlyPrice,
      originalPrice: null,
      equivMonthly: roundMoney((standardYearlyPrice / 12) * YEARLY_LIMITED_EXTRA_DISCOUNT),
      showLimitedDiscountBadge: true,
    };
  }

  return {
    displayPrice: standardYearlyPrice,
    originalPrice: null,
    equivMonthly: roundMoney(standardYearlyPrice / 12),
    showLimitedDiscountBadge: false,
  };
}

export function getPlanDisplayPrice(plan: PaymentMembershipPlan): number {
  const yearly = getYearlyPlanDisplay(plan);
  if (yearly) return yearly.displayPrice;
  return plan.price;
}
