import { Inject, Injectable } from '@nestjs/common';
import { ChannelStatus, ModelStatus, ProviderStatus, TaskType } from '@prisma/client';
import { PROVIDER_ADAPTERS } from '../../common/constants/injection-tokens';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderAdapter, RouteResolution } from '../../providers-adapters/provider.interface';

@Injectable()
export class RoutingService {
  private readonly adapterMap: Map<string, ProviderAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PROVIDER_ADAPTERS) adapters: ProviderAdapter[],
  ) {
    this.adapterMap = new Map(adapters.map((adapter) => [adapter.providerKey, adapter]));
  }

  async resolveRoute(modelKey: string, expectedTaskType?: TaskType): Promise<RouteResolution> {
    const model = await this.prisma.model.findUnique({
      where: { modelKey },
      include: {
        mappings: {
          where: { enabled: true },
          include: {
            provider: true,
            channel: true,
          },
          orderBy: [{ priority: 'asc' }, { fallbackOrder: 'asc' }],
        },
      },
    });

    if (!model || model.status !== ModelStatus.active) {
      throw new AppException('MODEL_NOT_FOUND', `Model ${modelKey} is not available`, 404);
    }

    if (expectedTaskType && model.taskType !== expectedTaskType) {
      throw new AppException(
        'MODEL_TASK_TYPE_MISMATCH',
        `Model ${modelKey} does not support ${expectedTaskType}`,
        400,
      );
    }

    const mapping = model.mappings.find(
      (item) =>
        item.provider.status === ProviderStatus.active &&
        item.channel.status === ChannelStatus.active,
    );

    if (!mapping) {
      throw new AppException('MODEL_ROUTE_NOT_CONFIGURED', 'model route not configured', 400, {
        modelKey,
      });
    }

    return {
      modelKey: model.modelKey,
      providerKey: mapping.provider.providerKey,
      channelKey: mapping.channel.channelKey,
      taskType: model.taskType,
      protocolType: model.protocolType,
      routeKey: mapping.routeKey,
      channelConfig: {
        baseUrl: mapping.channel.baseUrl,
        timeoutMs: mapping.channel.timeoutMs,
        credentialsJson: mapping.channel.credentialsJson,
      },
      mappingConfig: mapping.configJson,
    };
  }

  getAdapter(providerKey: string): ProviderAdapter {
    const adapter = this.adapterMap.get(providerKey);
    if (!adapter) {
      throw new AppException(
        'PROVIDER_ADAPTER_NOT_FOUND',
        `Adapter for provider ${providerKey} is not registered`,
        500,
      );
    }

    return adapter;
  }
}
