import { Injectable, BadRequestException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { ApiResponseStatus } from '../credits/dto/credits.dto';
import type { ServiceType } from '../credits/credits.config';
import { TeamCreditLedgerService } from './team-credit-ledger.service';

export interface ChargeBeginInput {
  userId: string;
  teamId?: string | null;
  serviceType: ServiceType;
  model?: string;
  inputImageCount?: number;
  outputImageCount?: number;
  requestParams?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  idempotencyKey?: string;
}

export interface ChargeHandle {
  apiUsageId: string;
  amount: number;
  userId: string;
  serviceType: ServiceType;
  teamFunded: boolean;
  teamId?: string;
  duplicate: boolean;
  duplicateReason?: 'idempotency' | 'fingerprint' | 'active-node';
}

@Injectable()
export class CreditChargeService {
  private readonly logger = new Logger(CreditChargeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    @Optional() private readonly ledger?: TeamCreditLedgerService,
  ) {}

  async resolveTeamFunding(
    teamId?: string | null,
  ): Promise<{ funded: boolean; teamId?: string }> {
    const id = typeof teamId === 'string' && teamId.trim().length > 0 ? teamId.trim() : undefined;
    if (!id || !this.ledger) return { funded: false };
    const team = await this.prisma.team.findUnique({
      where: { id },
      select: { isPersonal: true },
    });
    return team && team.isPersonal === false ? { funded: true, teamId: id } : { funded: false };
  }

  async begin(input: ChargeBeginInput): Promise<ChargeHandle> {
    const { funded, teamId } = await this.resolveTeamFunding(input.teamId);
    const requestParams = funded
      ? { ...(input.requestParams || {}), teamId }
      : input.requestParams;

    const deduct = await this.credits.preDeductCredits({
      userId: input.userId,
      serviceType: input.serviceType,
      model: input.model,
      inputImageCount: input.inputImageCount,
      outputImageCount: input.outputImageCount,
      requestParams,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      idempotencyKey: input.idempotencyKey,
      skipPersonalDeduction: funded,
    });

    const handle: ChargeHandle = {
      apiUsageId: deduct.apiUsageId,
      amount: deduct.creditsToDeduct,
      userId: input.userId,
      serviceType: input.serviceType,
      teamFunded: funded,
      teamId: funded ? teamId : undefined,
      duplicate: deduct.duplicate,
      duplicateReason: deduct.duplicateReason,
    };

    if (funded && teamId && !deduct.duplicate) {
      const reserved = await this.ledger!.reserve({
        teamId,
        amount: handle.amount,
        taskId: handle.apiUsageId,
        taskKind: input.serviceType,
        actorUserId: input.userId,
      });
      if (!reserved.reserved) {
        await this.credits
          .updateApiUsageStatus(
            handle.apiUsageId,
            ApiResponseStatus.FAILED,
            reserved.reason ?? '团队积分不足',
            0,
          )
          .catch((e) => this.logger.warn(`标记团队预留失败状态出错: ${this.msg(e)}`));
        throw new BadRequestException(reserved.reason ?? '团队积分不足');
      }
    }

    return handle;
  }

  async commit(
    handle: ChargeHandle,
    opts: { processingTime?: number; markSuccess?: boolean } = {},
  ): Promise<void> {
    if (opts.markSuccess !== false) {
      await this.credits
        .updateApiUsageStatus(
          handle.apiUsageId,
          ApiResponseStatus.SUCCESS,
          undefined,
          opts.processingTime ?? 0,
        )
        .catch((e) => this.logger.warn(`标记成功状态出错: ${this.msg(e)}`));
    }
    if (handle.teamFunded && handle.teamId) {
      await this.ledger!
        .deduct({
          teamId: handle.teamId,
          amount: handle.amount,
          taskId: handle.apiUsageId,
          taskKind: handle.serviceType,
          actorUserId: handle.userId,
        })
        .catch((e) => this.logger.warn(`团队积分确认扣除失败: ${this.msg(e)}`));
    }
  }

  async rollback(
    handle: ChargeHandle,
    opts: {
      errorMessage: string;
      processingTime?: number;
      personalRefund?: () => Promise<void>;
    },
  ): Promise<void> {
    if (handle.teamFunded && handle.teamId) {
      await this.credits
        .updateApiUsageStatus(
          handle.apiUsageId,
          ApiResponseStatus.FAILED,
          opts.errorMessage,
          opts.processingTime ?? 0,
        )
        .catch((e) => this.logger.warn(`团队模式标记失败状态出错: ${this.msg(e)}`));
      await this.ledger!
        .release({ teamId: handle.teamId, amount: handle.amount, taskId: handle.apiUsageId })
        .catch((e) => this.logger.warn(`团队积分释放失败: ${this.msg(e)}`));
      return;
    }

    if (opts.personalRefund) {
      await opts.personalRefund();
      return;
    }

    await this.credits
      .updateApiUsageStatus(
        handle.apiUsageId,
        ApiResponseStatus.FAILED,
        opts.errorMessage,
        opts.processingTime ?? 0,
      )
      .catch((e) => this.logger.warn(`个人模式标记失败状态出错: ${this.msg(e)}`));
    await this.credits
      .refundCredits(handle.userId, handle.apiUsageId)
      .catch((e) => this.logger.warn(`个人积分退款失败: ${this.msg(e)}`));
  }

  async resolveHandle(apiUsageId: string): Promise<ChargeHandle | null> {
    const rec = await this.prisma.apiUsageRecord.findUnique({
      where: { id: apiUsageId },
      select: { userId: true, creditsUsed: true, serviceType: true, requestParams: true },
    });
    if (!rec) return null;
    const params =
      rec.requestParams && typeof rec.requestParams === 'object' && !Array.isArray(rec.requestParams)
        ? (rec.requestParams as Record<string, any>)
        : null;
    const teamId =
      params && typeof params.teamId === 'string' && params.teamId.trim().length > 0
        ? params.teamId.trim()
        : undefined;
    if (!teamId) return null;
    const { funded } = await this.resolveTeamFunding(teamId);
    if (!funded) return null;
    return {
      apiUsageId,
      amount: rec.creditsUsed,
      userId: rec.userId,
      serviceType: rec.serviceType as ServiceType,
      teamFunded: true,
      teamId,
      duplicate: false,
    };
  }

  private msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}