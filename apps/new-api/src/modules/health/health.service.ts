import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/utils/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async getStatus(): Promise<{
    success: true;
    service: string;
    version: string;
    db: 'ok' | 'error';
    redis: 'ok' | 'error';
    time: string;
  }> {
    const dbStatus = await this.prisma
      .$queryRaw`SELECT 1`
      .then(() => 'ok' as const)
      .catch(() => 'error' as const);
    const redisStatus = await this.redisService
      .ping()
      .then(() => 'ok' as const)
      .catch(() => 'error' as const);

    return {
      success: true,
      service: 'new-api',
      version: '0.1.0',
      db: dbStatus,
      redis: redisStatus,
      time: new Date().toISOString(),
    };
  }
}
