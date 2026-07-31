import { Module, forwardRef } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';
import { CreditsSchedulerService } from './credits-scheduler.service';
import { CreditsAnomalyService } from './credits-anomaly.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ReferralModule } from '../referral/referral.module';
import { BusinessPolicyModule } from '../business-policy/business-policy.module';
import { TeamCollabModule } from '../team-collab/team-collab.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ReferralModule),
    BusinessPolicyModule,
    forwardRef(() => TeamCollabModule),
  ],
  controllers: [CreditsController],
  providers: [CreditsService, CreditsSchedulerService, CreditsAnomalyService],
  exports: [CreditsService, CreditsAnomalyService],
})
export class CreditsModule {}
