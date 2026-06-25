import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private shutdownHooksBound = false;

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    if (this.shutdownHooksBound) {
      return;
    }

    this.shutdownHooksBound = true;

    const shutdown = async () => {
      try {
        await this.$disconnect();
      } finally {
        await app.close();
      }
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}
