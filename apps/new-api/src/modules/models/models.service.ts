import { Injectable } from '@nestjs/common';
import { ModelStatus, Prisma, ProtocolType, TaskType } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.model.findMany({
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async create(input: {
    modelKey: string;
    name: string;
    taskType: TaskType;
    protocolType: ProtocolType;
    status?: ModelStatus;
    metadata?: Prisma.InputJsonValue;
  }) {
    const existing = await this.prisma.model.findUnique({
      where: { modelKey: input.modelKey },
    });
    if (existing) {
      throw new AppException('MODEL_ALREADY_EXISTS', `Model ${input.modelKey} already exists`, 409);
    }

    return this.prisma.model.create({
      data: {
        modelKey: input.modelKey,
        name: input.name,
        taskType: input.taskType,
        protocolType: input.protocolType,
        status: input.status ?? ModelStatus.active,
        metadata: input.metadata,
      },
    });
  }

  async listMappings() {
    return this.prisma.modelProviderMapping.findMany({
      include: {
        model: true,
        provider: true,
        channel: true,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createMapping(input: {
    modelId: string;
    providerId: string;
    channelId: string;
    routeKey: string;
    enabled?: boolean;
    priority?: number;
    fallbackOrder?: number | null;
    configJson?: Prisma.InputJsonValue;
  }) {
    const [model, provider, channel] = await Promise.all([
      this.prisma.model.findUnique({ where: { id: input.modelId } }),
      this.prisma.provider.findUnique({ where: { id: input.providerId } }),
      this.prisma.channel.findUnique({ where: { id: input.channelId } }),
    ]);

    if (!model) {
      throw new AppException('MODEL_NOT_FOUND', 'Model does not exist', 404);
    }
    if (!provider) {
      throw new AppException('PROVIDER_NOT_FOUND', 'Provider does not exist', 404);
    }
    if (!channel) {
      throw new AppException('CHANNEL_NOT_FOUND', 'Channel does not exist', 404);
    }
    if (channel.providerId !== provider.id) {
      throw new AppException(
        'CHANNEL_PROVIDER_MISMATCH',
        'Channel does not belong to the specified provider',
        400,
      );
    }

    return this.prisma.modelProviderMapping.create({
      data: {
        modelId: input.modelId,
        providerId: input.providerId,
        channelId: input.channelId,
        routeKey: input.routeKey,
        enabled: input.enabled ?? true,
        priority: input.priority ?? 100,
        fallbackOrder: input.fallbackOrder,
        configJson: input.configJson,
      },
      include: {
        model: true,
        provider: true,
        channel: true,
      },
    });
  }

  async setMappingEnabled(id: string, enabled: boolean) {
    return this.prisma.modelProviderMapping.update({
      where: { id },
      data: { enabled },
      include: {
        model: true,
        provider: true,
        channel: true,
      },
    });
  }
}
