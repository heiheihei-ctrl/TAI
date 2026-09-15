import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { buildMembershipCreditLotData } from '../src/credits/credit-lot-grants';

// Targeted repair: dry-run by default; --apply commits the audited difference.
const prisma = new PrismaClient();
const orderId = 'bdc11e6c-cf35-455f-907e-84b1afba3f40';
async function main() {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PaymentOrder" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
    const user = await tx.user.findUniqueOrThrow({ where: { phone: '13602525050' }, select: { id: true } });
    if (order.userId !== user.id || order.status !== 'paid' || order.orderType !== 'membership' || !order.subscriptionId) {
      throw new Error('Order identity/status mismatch');
    }
    await tx.$queryRaw`SELECT id FROM "UserMembershipSubscription" WHERE id = ${order.subscriptionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "CreditAccount" WHERE "userId" = ${user.id} FOR UPDATE`;
    const subscription = await tx.userMembershipSubscription.findUniqueOrThrow({ where: { id: order.subscriptionId } });
    const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId: user.id } });
    const snapshot = order.planSnapshot as Prisma.JsonObject;
    if (snapshot.billingCycle !== 'yearly' || snapshot.monthlyQuotaCredits !== 8700 || snapshot.signupBonusCredits !== 0 ||
        subscription.lastOrderId !== orderId || subscription.renewalCount !== 0 || subscription.status !== 'active') {
      throw new Error('Unexpected subscription or purchased entitlement; manual review required');
    }
    // One-off exception for this verified order; normal memberships remain monthly grants.
    const expected = 8700 * 12;
    const grants = await tx.creditTransaction.findMany({ where: {
      accountId: account.id, subscriptionId: subscription.id,
      businessType: { in: ['membership_grant', 'membership_refresh', 'membership_yearly_backfill'] },
    } });
    const granted = grants.reduce((sum, grant) => sum + grant.amount, 0);
    const difference = expected - granted;
    if (difference < 0 || !grants.some(g => g.orderId === orderId && g.businessType === 'membership_grant' && g.amount === 8700)) {
      throw new Error('Unexpected grant ledger');
    }
    const report = { orderNo: order.orderNo, expected, granted, difference, balanceBefore: account.balance,
      balanceAfter: account.balance + difference, applied: process.argv.includes('--apply') };
    if (!report.applied || difference === 0) return report;
    const now = new Date();
    if (subscription.currentPeriodEndAt <= now) throw new Error('Subscription has expired');
    const lot = await tx.creditLot.create({ data: buildMembershipCreditLotData({
      accountId: account.id, amount: difference, grantedAt: now, activeAt: now,
      expiresAt: subscription.currentPeriodEndAt, orderId, subscriptionId: subscription.id,
      metadata: { repair: 'yearly_upfront_20260915', expected, previouslyGranted: granted },
    }) });
    await tx.creditAccount.update({ where: { id: account.id }, data: {
      balance: { increment: difference }, totalEarned: { increment: difference },
    } });
    await tx.creditTransaction.create({ data: {
      accountId: account.id, type: 'earn', amount: difference, balanceBefore: account.balance,
      balanceAfter: report.balanceAfter, description: '日常创作年付套餐积分差额补发',
      businessType: 'membership_yearly_backfill', creditLotId: lot.id, orderId,
      subscriptionId: subscription.id, membershipPlanId: order.membershipPlanId,
      metadata: { repair: 'yearly_upfront_20260915', expected, previouslyGranted: granted },
    } });
    const subscriptionSnapshot = subscription.snapshot as Prisma.JsonObject;
    await tx.userMembershipSubscription.update({ where: { id: subscription.id }, data: {
      snapshot: { ...subscriptionSnapshot, metadata: {
        ...(subscriptionSnapshot.metadata as Prisma.JsonObject), creditGrantMode: 'yearly_upfront',
      } },
    } });
    // Existing deployed scheduler counts membership_refresh rows. Zero-amount markers
    // settle the remaining prepaid windows until the new mode-aware code is deployed.
    const existingRefreshes = grants.filter(g => g.businessType === 'membership_refresh').length;
    for (let index = existingRefreshes; index < 11; index += 1) {
      await tx.creditTransaction.create({ data: {
        accountId: account.id, type: 'earn', amount: 0, balanceBefore: report.balanceAfter,
        balanceAfter: report.balanceAfter, description: '年付额度已提前补足，本期无需重复发放',
        businessType: 'membership_refresh', orderId, subscriptionId: subscription.id,
        membershipPlanId: order.membershipPlanId,
        metadata: { repair: 'yearly_upfront_20260915', prepaidCycleIndex: index + 1 },
      } });
    }
    return report;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Repair failed'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());