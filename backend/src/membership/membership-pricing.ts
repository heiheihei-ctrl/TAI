import type { MembershipBillingCycle } from './membership.types';

type MembershipPricingPlanLike = {
  name?: string | null;
  billingCycle?: string | null;
  price?: number | string | { toString(): string } | null;
};

export type MembershipPromoCardConfig = {
  effectivePrice: number;
  billingLabel?: string;
  promoText: string;
  displayEquivMonthly?: string;
  showRecommended?: boolean;
};

function normalizeBillingCycle(value: string | null | undefined): MembershipBillingCycle | null {
  if (value === 'monthly' || value === 'yearly') return value;
  return null;
}

function toNumber(value: MembershipPricingPlanLike['price']): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && typeof value.toString === 'function') {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getMembershipPromoCardConfig(
  plan: MembershipPricingPlanLike,
): MembershipPromoCardConfig | null {
  const name = (plan.name || '').trim();
  const billingCycle = normalizeBillingCycle(plan.billingCycle);

  if (billingCycle === 'monthly') {
    if (name.includes('日常创作')) {
      return {
        effectivePrice: 39,
        billingLabel: '首月特惠',
        promoText: '限时5.5折专享',
      };
    }

    if (name.includes('专业进阶')) {
      return {
        effectivePrice: 149,
        billingLabel: '首月特惠',
        promoText: '限时7.5折专享',
        showRecommended: true,
      };
    }

    if (name.includes('旗舰尊享') || name.includes('旗舰专享') || name.includes('旗舰')) {
      return {
        effectivePrice: 429,
        billingLabel: '首月特惠',
        promoText: '限时7折专享',
      };
    }
  }

  if (billingCycle === 'yearly') {
    if (name.includes('日常创作')) {
      return {
        effectivePrice: 658,
        billingLabel: '首年特惠',
        promoText: '限时8折专享',
        displayEquivMonthly: '54.83',
      };
    }

    if (name.includes('专业进阶')) {
      return {
        effectivePrice: 1888,
        billingLabel: '首年特惠',
        promoText: '限时8折专享',
        displayEquivMonthly: '157.33',
        showRecommended: true,
      };
    }

    if (name.includes('旗舰尊享') || name.includes('旗舰专享') || name.includes('旗舰')) {
      return {
        effectivePrice: 5688,
        billingLabel: '首年特惠',
        promoText: '限时8折专享',
        displayEquivMonthly: '474',
      };
    }
  }

  return null;
}

export function getEffectiveMembershipPlanPrice(plan: MembershipPricingPlanLike): number {
  const promoConfig = getMembershipPromoCardConfig(plan);
  if (promoConfig) return promoConfig.effectivePrice;
  return toNumber(plan.price) ?? 0;
}
