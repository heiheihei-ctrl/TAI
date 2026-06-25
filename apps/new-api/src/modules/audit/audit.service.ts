import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toPrismaJson } from '../../common/utils/prisma-json.util';

interface RequestLogPayload {
  requestId: string;
  path: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  modelKey?: string;
  providerKey?: string;
  channelKey?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logRequest(payload: RequestLogPayload): Promise<void> {
    await this.prisma.requestLog.create({
      data: payload,
    }).catch((error: unknown) => {
      this.logger.warn(`Failed to persist request log: ${String(error)}`);
    });
  }

  async logChannelHealth(input: {
    providerKey: string;
    channelKey: string;
    eventType: string;
    message: string;
    detailJson?: unknown;
  }): Promise<void> {
    await this.prisma.channelHealthLog.create({
      data: {
        ...input,
        detailJson: toPrismaJson((input.detailJson ?? null) as Record<string, unknown> | null),
      },
    }).catch((error: unknown) => {
      this.logger.warn(`Failed to persist channel health log: ${String(error)}`);
    });
  }
}
