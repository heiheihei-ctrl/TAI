import { Injectable } from '@nestjs/common';
import { ApiResponseStatus } from '../../credits/dto/credits.dto';
import { CreditsService } from '../../credits/credits.service';
import { VOLC_VIDEO_ENHANCE_SERVICE_TYPE } from '../constants/volc-video-enhance.constants';
import { PrismaService } from '../../prisma/prisma.service';

type VolcVideoEnhanceTaskUsageBinding = {
  apiUsageId: string;
  userId: string;
  createdAt: Date;
};

@Injectable()
export class VolcVideoEnhanceBillingService {
  constructor(
    private readonly creditsService: CreditsService,
    private readonly prisma: PrismaService,
  ) {}

  async preDeduct(params: {
    userId: string;
    model?: string;
    requestParams: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    idempotencyKey?: string;
  }) {
    return this.creditsService.preDeductCredits({
      userId: params.userId,
      serviceType: VOLC_VIDEO_ENHANCE_SERVICE_TYPE,
      model: params.model,
      requestParams: params.requestParams,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      idempotencyKey: params.idempotencyKey,
    });
  }

  async bindTask(apiUsageId: string, payload: Record<string, any>) {
    await this.creditsService.updateApiUsageRequestParams(apiUsageId, payload);
  }

  async findTaskUsageBinding(
    taskId: string,
    userId?: string,
  ): Promise<VolcVideoEnhanceTaskUsageBinding | null> {
    const normalizedTaskId = typeof taskId === 'string' ? taskId.trim() : '';
    if (!normalizedTaskId) return null;

    const record = await this.prisma.apiUsageRecord.findFirst({
      where: {
        serviceType: VOLC_VIDEO_ENHANCE_SERVICE_TYPE,
        ...(userId ? { userId } : {}),
        requestParams: {
          path: ['taskId'],
          equals: normalizedTaskId,
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        createdAt: true,
      },
    });

    if (!record) return null;

    return {
      apiUsageId: record.id,
      userId: record.userId,
      createdAt: record.createdAt,
    };
  }

  async markFailed(apiUsageId: string, errorMessage: string, processingTime = 0) {
    await this.creditsService.updateApiUsageStatus(
      apiUsageId,
      ApiResponseStatus.FAILED,
      errorMessage,
      processingTime,
    );
  }

  async refund(userId: string, apiUsageId: string) {
    return this.creditsService.refundCredits(userId, apiUsageId);
  }

  async markSuccess(userId: string, apiUsageId: string, processingTime = 0) {
    await this.creditsService.markApiUsageSuccessForUser(
      userId,
      apiUsageId,
      processingTime,
    );
  }
}
