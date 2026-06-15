import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UpdateGoogleApiKeyDto {
  googleCustomApiKey?: string | null;
  googleKeyMode?: 'official' | 'custom';
}

export interface UpdateProfileDto {
  name?: string;
  avatarUrl?: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async touchLastLoginAt(userId: string, throttleMs = 60 * 1000) {
    const now = new Date();
    const threshold = new Date(now.getTime() - throttleMs);
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: threshold } }],
      },
      data: { lastLoginAt: now },
    });
  }

  async create(data: { phone: string; passwordHash: string; name?: string; email?: string }) {
    return this.prisma.user.create({
      data: {
        email: data.email ? data.email.toLowerCase() : null,
        passwordHash: data.passwordHash,
        name: data.name,
        phone: data.phone,
      },
      select: { id: true, email: true, phone: true, name: true, avatarUrl: true, role: true, status: true, createdAt: true },
    });
  }

  async updateGoogleApiKey(userId: string, dto: UpdateGoogleApiKeyDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        googleCustomApiKey: dto.googleCustomApiKey,
        googleKeyMode: dto.googleKeyMode ?? 'custom',
      },
      select: {
        id: true,
        googleCustomApiKey: true,
        googleKeyMode: true,
      },
    });
  }

  async getGoogleApiKey(userId: string): Promise<{ apiKey: string | null; mode: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        googleCustomApiKey: true,
        googleKeyMode: true,
      },
    });
    return {
      apiKey: user?.googleCustomApiKey ?? null,
      mode: user?.googleKeyMode ?? 'official',
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const data: { name?: string; avatarUrl?: string | null } = {};

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (!trimmedName) {
        throw new BadRequestException('用户名不能为空');
      }
      if (user.email && trimmedName.toLowerCase() === user.email.toLowerCase()) {
        throw new BadRequestException('用户名不能与邮箱相同');
      }
      if (trimmedName === user.phone) {
        throw new BadRequestException('用户名不能与手机号相同');
      }
      const existsPhoneMatchedByName = await this.prisma.user.findFirst({
        where: { phone: trimmedName },
        select: { id: true },
      });
      if (existsPhoneMatchedByName && existsPhoneMatchedByName.id !== userId) {
        throw new BadRequestException('用户名不能与手机号相同');
      }
      data.name = trimmedName;
    }

    if (dto.avatarUrl !== undefined) {
      const trimmedAvatarUrl = typeof dto.avatarUrl === 'string' ? dto.avatarUrl.trim() : '';
      const lowered = trimmedAvatarUrl.toLowerCase();
      if (
        lowered.startsWith('data:') ||
        lowered.startsWith('blob:') ||
        /^[a-z0-9+/]+=*$/i.test(trimmedAvatarUrl)
      ) {
        throw new BadRequestException('头像必须使用可持久化的远程地址');
      }
      data.avatarUrl = trimmedAvatarUrl || null;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatarUrl: true,
        role: true,
      },
    });
  }

  sanitize(user: any) {
    if (!user) return user;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
