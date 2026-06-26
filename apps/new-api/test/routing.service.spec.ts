import { TaskType } from '@prisma/client';
import { RoutingService } from '../src/modules/routing/routing.service';
import { createPrismaMock } from './test-helpers';

describe('RoutingService', () => {
  it('selects the highest-priority enabled mapping', async () => {
    const prisma = createPrismaMock();
    prisma.__data.models.push({
      id: 'mdl_1',
      modelKey: 'video-x',
      name: 'Video X',
      taskType: 'video',
      protocolType: 'task',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: null,
    });
    prisma.__data.providers.push(
      {
        id: 'prov_1',
        providerKey: 'dummy',
        name: 'Dummy',
        type: 'demo',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: null,
      },
      {
        id: 'prov_2',
        providerKey: 'openai',
        name: 'OpenAI',
        type: 'demo',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: null,
      },
    );
    prisma.__data.channels.push(
      {
        id: 'chn_1',
        providerId: 'prov_1',
        channelKey: 'dummy-low',
        name: 'Dummy low',
        status: 'active',
        credentialType: 'none',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'chn_2',
        providerId: 'prov_2',
        channelKey: 'openai-high',
        name: 'OpenAI high',
        status: 'active',
        credentialType: 'none',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    prisma.__data.mappings.push(
      {
        id: 'map_1',
        modelId: 'mdl_1',
        providerId: 'prov_1',
        channelId: 'chn_1',
        routeKey: 'dummy.video',
        enabled: true,
        priority: 10,
        fallbackOrder: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'map_2',
        modelId: 'mdl_1',
        providerId: 'prov_2',
        channelId: 'chn_2',
        routeKey: 'openai.video',
        enabled: true,
        priority: 1,
        fallbackOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const service = new RoutingService(prisma as any, [] as any);
    const route = await service.resolveRoute('video-x', TaskType.video);

    expect(route.providerKey).toBe('openai');
    expect(route.channelKey).toBe('openai-high');
  });
});
