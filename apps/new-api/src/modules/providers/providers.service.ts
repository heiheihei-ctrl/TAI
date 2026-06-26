import { Injectable } from '@nestjs/common';
import { Prisma, ProviderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.provider.findMany({
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async create(input: {
    providerKey: string;
    name: string;
    type: string;
    status?: ProviderStatus;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.provider.create({
      data: {
        providerKey: input.providerKey,
        name: input.name,
        type: input.type,
        status: input.status ?? ProviderStatus.active,
        metadata: input.metadata,
      },
    });
  }
}
