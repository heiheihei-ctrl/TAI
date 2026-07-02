import type { MembershipBillingCycle } from './membership.types';

type MembershipPricingPlanLike = {
  code?: string | null;
  name?: string | null;
  billingCycle?: string | null;
  price?: number | string | { toString(): string } | null;
};

export type YearlyPricingView = {
  effectivePrice: number;
  originalPrice: number | null;
  equivalentMonthly: number | null;
  showLimitedDiscount: boolean;
};

const YEARLY_BASE_DISCOUNT = 0.8;
const YEARLY_LIMITED_EXTRA_DISCOUNT = 0.8;

function normalizeBillingCycle(value: string | null | undefined): MembershipBillingCycle | null {
  if (value === 'monthly' || value === 'yearly') return value;
  return null;
}

function toNumber(value: MembershipPricingPlanLike['price']): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object' && typeof value.toString === 'function') {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeStandardYearlyPrice(monthlyListPrice: number): number {
  return Math.round(monthlyListPrice * 12 * YEARLY_BASE_DISCOUNT);
}

export function resolveMonthlyListPrice(plan: MembershipPricingPlanLike): number | null {
  const code = (plan.code || '').trim().toLowerCase();
  const name = (plan.name || '').trim();

  if (code.includes('599') || name.includes('旗舰')) return 599;
  if (code.includes('199') || name.includes('专业')) return 199;
  if (code.includes('69') || name.includes('日常')) return 69;

  return null;
}

export function isProfessionalYearlyPlan(plan: MembershipPricingPlanLike): boolean {
  return normalizeBillingCycle(plan.billingCycle) === 'yearly' && resolveMonthlyListPrice(plan) === 199;
}

export function isDailyCreationYearlyPlan(plan: MembershipPricingPlanLike): boolean {
  return normalizeBillingCycle(plan.billingCycle) === 'yearly' && resolveMonthlyListPrice(plan) === 69;
}

export function getYearlyPricingView(plan: MembershipPricingPlanLike): YearlyPricingView | null {
  if (normalizeBillingCycle(plan.billingCycle) !== 'yearly') return null;

  const monthlyListPrice = resolveMonthlyListPrice(plan);
  if (monthlyListPrice == null) return null;

  const standardYearlyPrice = computeStandardYearlyPrice(monthlyListPrice);

  if (monthlyListPrice === 199) {
    const effectivePrice = Math.round(standardYearlyPrice * YEARLY_LIMITED_EXTRA_DISCOUNT);
    return {
      effectivePrice,
      originalPrice: standardYearlyPrice,
      equivalentMonthly: roundMoney(effectivePrice / 12),
      showLimitedDiscount: true,
    };
  }

  if (monthlyListPrice === 69) {
    return {
      effectivePrice: standardYearlyPrice,
      originalPrice: null,
      equivalentMonthly: roundMoney((standardYearlyPrice / 12) * YEARLY_LIMITED_EXTRA_DISCOUNT),
      showLimitedDiscount: true,
    };
  }

  return {
    effectivePrice: standardYearlyPrice,
    originalPrice: null,
    equivalentMonthly: roundMoney(standardYearlyPrice / 12),
    showLimitedDiscount: false,
  };
}

/** 会员套餐应付价格 */
export function getEffectiveMembershipPlanPrice(plan: MembershipPricingPlanLike): number {
  const yearlyView = getYearlyPricingView(plan);
  if (yearlyView) return yearlyView.effectivePrice;
  return toNumber(plan.price);
}
