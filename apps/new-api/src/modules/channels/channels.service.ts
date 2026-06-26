import { Injectable } from '@nestjs/common';
import { ChannelStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { sanitizeCredentials } from '../../common/utils/sensitive.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const channels = await this.prisma.channel.findMany({
      include: {
        provider: true,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });

    return channels.map((channel) => this.toSafeChannel(channel));
  }

  async create(input: {
    providerId: string;
    channelKey: string;
    name: string;
    status?: ChannelStatus;
    baseUrl?: string | null;
    credentialType: string;
    credentialsEncrypted?: string | null;
    credentialsJson?: Prisma.InputJsonValue;
    priority?: number;
    rateLimitQps?: number | null;
    timeoutMs?: number | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    const provider = await this.prisma.provider.findUnique({
      where: { id: input.providerId },
    });
    if (!provider) {
      throw new AppException('PROVIDER_NOT_FOUND', 'Provider does not exist', 404);
    }

    const created = await this.prisma.channel.create({
      data: {
        providerId: input.providerId,
        channelKey: input.channelKey,
        name: input.name,
        status: input.status ?? ChannelStatus.active,
        baseUrl: input.baseUrl,
        credentialType: input.credentialType,
        credentialsEncrypted: input.credentialsEncrypted,
        credentialsJson: input.credentialsJson,
        priority: input.priority ?? 100,
        rateLimitQps: input.rateLimitQps,
        timeoutMs: input.timeoutMs,
        metadata: input.metadata,
      },
      include: {
        provider: true,
      },
    });

    return this.toSafeChannel(created);
  }

  toSafeChannel<T extends { credentialsEncrypted?: string | null; credentialsJson?: unknown }>(channel: T) {
    return {
      ...channel,
      credentialsEncrypted: channel.credentialsEncrypted ? '***masked***' : null,
      credentialsJson: sanitizeCredentials(channel.credentialsJson),
    };
  }
}
