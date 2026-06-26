import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenStatus } from '@prisma/client';
import {
  AuthenticatedPrincipal,
  compareTokenHash,
  generatePlainToken,
  hashToken,
} from '../../common/auth/auth.util';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async validateBearerToken(token: string): Promise<AuthenticatedPrincipal> {
    const bootstrapToken = this.configService.get<string>('app.bootstrapToken', '');
    if (bootstrapToken && token === bootstrapToken) {
      return {
        tokenName: 'bootstrap',
        scopes: ['admin', 'gateway'],
        source: 'bootstrap',
      };
    }

    const tokenHash = hashToken(token);
    const record = await this.prisma.apiToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.status !== TokenStatus.active || !compareTokenHash(token, record.tokenHash)) {
      throw new AppException('AUTH_INVALID_TOKEN', 'Invalid bearer token', 401);
    }

    await this.prisma.apiToken.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      tokenId: record.id,
      tokenName: record.name,
      scopes: record.scopes,
      source: 'database',
    };
  }

  async issueToken(name: string, scopes: string[]): Promise<{
    id: string;
    name: string;
    token: string;
    scopes: string[];
  }> {
    const token = generatePlainToken();
    const created = await this.prisma.apiToken.create({
      data: {
        name,
        scopes,
        tokenHash: hashToken(token),
      },
    });

    return {
      id: created.id,
      name: created.name,
      token,
      scopes: created.scopes,
    };
  }
}
