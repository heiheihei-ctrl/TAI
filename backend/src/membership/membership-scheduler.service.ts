import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreditsService } from '../credits/credits.service';
import { MembershipService } from './membership.service';

@Injectable()
export class MembershipSchedulerService {
  private readonly logger = new Logger(MembershipSchedulerService.name);
  private expiryJobRunning = false;
  private freeMonthlyQuotaJobRunning = false;
  private giftDecayJobRunning = false;
  private yearlyRefreshJobRunning = false;
  private scheduledChangeJobRunning = false;

  constructor(
    private readonly membershipService: MembershipService,
    private readonly creditsService: CreditsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleFreeMonthlyQuotaIssue() {
    // 已停用：免费用户不再发放月度额度
    return;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleMembershipExpiry() {
    if (this.expiryJobRunning) {
      this.logger.warn('跳过会员到期扫描：上一次任务尚未完成');
      return;
    }

    this.expiryJobRunning = true;
    try {
      const result = await this.membershipService.expireElapsedMemberships();
      if (
        result.expiredSubscriptions > 0 ||
        result.expiredLots > 0 ||
        result.resetSnapshots > 0
      ) {
        this.logger.log(
          `会员到期扫描完成: subscriptions=${result.expiredSubscriptions}, lots=${result.expiredLots}, resetSnapshots=${result.resetSnapshots}, expiredCredits=${result.expiredCredits}`,
        );
      }
    } catch (error) {
      this.logger.error('会员到期扫描失败:', error);
    } finally {
      this.expiryJobRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleScheduledMembershipChanges() {
    if (this.scheduledChangeJobRunning) {
      this.logger.warn('跳过待生效订阅切换：上一次任务尚未完成');
      return;
    }

    this.scheduledChangeJobRunning = true;
    try {
      const result = await this.membershipService.applyDueScheduledChanges();
      if (result.appliedCount > 0) {
        this.logger.log(`待生效订阅切换完成: applied=${result.appliedCount}`);
      }
    } catch (error) {
      this.logger.error('待生效订阅切换失败:', error);
    } finally {
      this.scheduledChangeJobRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleGiftDecay() {
    // Product policy: daily gift credit decay is disabled.
    return;
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async handleDailyMembershipGiftIssue() {
    // Product policy: VIP plans no longer issue daily gift credits.
    return;
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleYearlyQuotaRefresh() {
    // Product policy: yearly subscription monthly quota refresh is disabled.
    return;
  }
}
