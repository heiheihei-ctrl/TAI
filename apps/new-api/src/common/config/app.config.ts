import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: Number(process.env.PORT ?? 4455),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? '',
  sessionSecret: process.env.SESSION_SECRET ?? '',
  bootstrapToken: process.env.NEW_API_BOOTSTRAP_TOKEN ?? '',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 30000),
}));
