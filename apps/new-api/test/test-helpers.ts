import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppExceptionFilter } from '../src/common/errors/exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/common/utils/redis.service';

export function createPrismaMock() {
  const providers: any[] = [];
  const channels: any[] = [];
  const models: any[] = [];
  const mappings: any[] = [];
  const tasks: any[] = [];
  const apiTokens: any[] = [];
  const requestLogs: any[] = [];
  const channelHealthLogs: any[] = [];

  const now = () => new Date();
  const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

  return {
    __data: { providers, channels, models, mappings, tasks, apiTokens, requestLogs, channelHealthLogs },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $on: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    apiToken: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return apiTokens.find((item) => item.id === where.id) ?? null;
        if (where.tokenHash) return apiTokens.find((item) => item.tokenHash === where.tokenHash) ?? null;
        return null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const record = { id: id('tok'), createdAt: now(), updatedAt: now(), lastUsedAt: null, status: 'active', ...data };
        apiTokens.push(record);
        return record;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const record = apiTokens.find((item) => item.id === where.id);
        Object.assign(record, data, { updatedAt: now() });
        return record;
      }),
    },
    provider: {
      findMany: jest.fn(async () => [...providers].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
      findUnique: jest.fn(async ({ where }: any) => providers.find((item) => item.id === where.id || item.providerKey === where.providerKey) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const record = { id: id('prov'), createdAt: now(), updatedAt: now(), metadata: null, status: 'active', ...data };
        providers.push(record);
        return record;
      }),
    },
    channel: {
      findMany: jest.fn(async () =>
        channels.map((channel) => ({
          ...channel,
          provider: providers.find((provider) => provider.id === channel.providerId),
        })),
      ),
      findUnique: jest.fn(async ({ where }: any) => channels.find((item) => item.id === where.id || item.channelKey === where.channelKey) ?? null),
      create: jest.fn(async ({ data, include }: any) => {
        const record = { id: id('chn'), createdAt: now(), updatedAt: now(), ...data };
        channels.push(record);
        if (include?.provider) {
          return { ...record, provider: providers.find((provider) => provider.id === record.providerId) };
        }
        return record;
      }),
    },
    model: {
      findMany: jest.fn(async () => [...models].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
      findUnique: jest.fn(async ({ where, include }: any) => {
        const model = models.find((item) => item.id === where.id || item.modelKey === where.modelKey) ?? null;
        if (!model) return null;
        if (include?.mappings) {
          const modelMappings = mappings
            .filter((item) => item.modelId === model.id && (include.mappings.where?.enabled === undefined || item.enabled === include.mappings.where.enabled))
            .map((mapping) => ({
              ...mapping,
              provider: providers.find((provider) => provider.id === mapping.providerId),
              channel: channels.find((channel) => channel.id === mapping.channelId),
            }))
            .sort((a, b) => a.priority - b.priority);
          return { ...model, mappings: modelMappings };
        }
        return model;
      }),
      create: jest.fn(async ({ data }: any) => {
        const record = { id: id('mdl'), createdAt: now(), updatedAt: now(), metadata: null, status: 'active', ...data };
        models.push(record);
        return record;
      }),
    },
    modelProviderMapping: {
      findMany: jest.fn(async () =>
        mappings.map((mapping) => ({
          ...mapping,
          model: models.find((model) => model.id === mapping.modelId),
          provider: providers.find((provider) => provider.id === mapping.providerId),
          channel: channels.find((channel) => channel.id === mapping.channelId),
        })),
      ),
      create: jest.fn(async ({ data, include }: any) => {
        const record = { id: id('map'), createdAt: now(), updatedAt: now(), enabled: true, priority: 100, ...data };
        mappings.push(record);
        if (include) {
          return {
            ...record,
            model: models.find((model) => model.id === record.modelId),
            provider: providers.find((provider) => provider.id === record.providerId),
            channel: channels.find((channel) => channel.id === record.channelId),
          };
        }
        return record;
      }),
      update: jest.fn(async ({ where, data, include }: any) => {
        const record = mappings.find((item) => item.id === where.id);
        Object.assign(record, data, { updatedAt: now() });
        if (include) {
          return {
            ...record,
            model: models.find((model) => model.id === record.modelId),
            provider: providers.find((provider) => provider.id === record.providerId),
            channel: channels.find((channel) => channel.id === record.channelId),
          };
        }
        return record;
      }),
    },
    task: {
      create: jest.fn(async ({ data }: any) => {
        const record = { id: id('taskdb'), createdAt: now(), updatedAt: now(), finishedAt: null, errorMessage: null, upstreamTaskId: null, upstreamStatus: null, normalizedResponseJson: null, upstreamResponseJson: null, providerKey: null, channelKey: null, callbackUrl: null, ...data };
        tasks.push(record);
        return record;
      }),
      findUnique: jest.fn(async ({ where }: any) => tasks.find((item) => item.id === where.id || item.internalTaskId === where.internalTaskId) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const record = tasks.find((item) => item.id === where.id || item.internalTaskId === where.internalTaskId);
        if (!record) throw new Error('Not found');
        return record;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const record = tasks.find((item) => item.id === where.id || item.internalTaskId === where.internalTaskId);
        Object.assign(record, data, { updatedAt: now() });
        return record;
      }),
    },
    requestLog: {
      create: jest.fn(async ({ data }: any) => {
        requestLogs.push({ id: id('reqlog'), createdAt: now(), ...data });
      }),
    },
    channelHealthLog: {
      create: jest.fn(async ({ data }: any) => {
        channelHealthLogs.push({ id: id('health'), createdAt: now(), ...data });
      }),
    },
  };
}

export async function createTestingApp(options?: {
  prismaMock?: ReturnType<typeof createPrismaMock>;
  redisPing?: string;
}): Promise<{
  app: INestApplication;
  prismaMock: ReturnType<typeof createPrismaMock>;
}> {
  process.env.PORT = '4455';
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test';
  process.env.REDIS_URL = 'redis://test';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.NEW_API_BOOTSTRAP_TOKEN = 'bootstrap-token';
  process.env.LOG_LEVEL = 'debug';
  process.env.REQUEST_TIMEOUT_MS = '30000';

  const { AppModule } = await import('../src/app.module');
  const prismaMock = options?.prismaMock ?? createPrismaMock();
  const redisMock = {
    ping: jest.fn().mockResolvedValue(options?.redisPing ?? 'PONG'),
  };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(RedisService)
    .useValue(redisMock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AppExceptionFilter());
  await app.init();

  return { app, prismaMock };
}
