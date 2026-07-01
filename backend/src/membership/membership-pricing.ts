type MembershipPricingPlanLike = {
  name?: string | null;
  billingCycle?: string | null;
  price?: number | string | { toString(): string } | null;
};

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

/** 会员套餐应付价格：直接使用套餐表中的原价，不再套用限时折扣。 */
export function getEffectiveMembershipPlanPrice(plan: MembershipPricingPlanLike): number {
  return toNumber(plan.price);
}
