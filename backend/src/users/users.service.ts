import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateExtendedProfileDto } from './dto/update-extended-profile.dto';

export const PROFILE_COMPLETION_REWARD_CREDITS = 50;

export interface ExtendedProfileView {
  realName: string | null;
  gender: string | null;
  age: number | null;
  occupation: string | null;
  company: string | null;
  region: string | null;
  isComplete: boolean;
  rewardClaimed: boolean;
  rewardCredits: number;
  completedAt: string | null;
}

export interface UpdateExtendedProfileDtoInput {
  realName?: string;
  gender?: string;
  age?: number;
  occupation?: string;
  company?: string;
  region?: string;
}

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
        profileRealName: true,
        profileGender: true,
        profileAge: true,
        profileOccupation: true,
        profileCompany: true,
        profileRegion: true,
        profileCompletedAt: true,
        profileRewardClaimed: true,
      },
    });
  }

  private mapExtendedProfile(user: {
    profileRealName?: string | null;
    profileGender?: string | null;
    profileAge?: number | null;
    profileOccupation?: string | null;
    profileCompany?: string | null;
    profileRegion?: string | null;
    profileCompletedAt?: Date | null;
    profileRewardClaimed?: boolean | null;
  }): ExtendedProfileView {
    const realName = user.profileRealName?.trim() || null;
    const gender = user.profileGender?.trim() || null;
    const age = typeof user.profileAge === 'number' ? user.profileAge : null;
    const occupation = user.profileOccupation?.trim() || null;
    const company = user.profileCompany?.trim() || null;
    const region = user.profileRegion?.trim() || null;
    const isComplete = Boolean(realName && gender && age && occupation && company && region);

    return {
      realName,
      gender,
      age,
      occupation,
      company,
      region,
      isComplete,
      rewardClaimed: Boolean(user.profileRewardClaimed),
      rewardCredits: PROFILE_COMPLETION_REWARD_CREDITS,
      completedAt: user.profileCompletedAt?.toISOString() ?? null,
    };
  }

  async getExtendedProfile(userId: string): Promise<ExtendedProfileView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        profileRealName: true,
        profileGender: true,
        profileAge: true,
        profileOccupation: true,
        profileCompany: true,
        profileRegion: true,
        profileCompletedAt: true,
        profileRewardClaimed: true,
      },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return this.mapExtendedProfile(user);
  }

  async updateExtendedProfile(userId: string, dto: UpdateExtendedProfileDtoInput) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        profileRealName: true,
        profileGender: true,
        profileAge: true,
        profileOccupation: true,
        profileCompany: true,
        profileRegion: true,
        profileCompletedAt: true,
        profileRewardClaimed: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('用户不存在');
    }

    const realName = (dto.realName ?? existing.profileRealName ?? '').trim();
    const gender = (dto.gender ?? existing.profileGender ?? '').trim();
    const age = dto.age ?? existing.profileAge ?? null;
    const occupation = (dto.occupation ?? existing.profileOccupation ?? '').trim();
    const company = (dto.company ?? existing.profileCompany ?? '').trim();
    const region = (dto.region ?? existing.profileRegion ?? '').trim();

    if (!realName || !gender || age == null || !occupation || !company || !region) {
      throw new BadRequestException('请填写完整资料：真实姓名、性别、年龄、职业、公司与所在地区');
    }
    if (age < 1 || age > 120) {
      throw new BadRequestException('年龄无效');
    }

    const isComplete = Boolean(realName && gender && age && occupation && company && region);
    const shouldGrantReward = isComplete && !existing.profileRewardClaimed;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          profileRealName: realName,
          profileGender: gender,
          profileAge: age,
          profileOccupation: occupation,
          profileCompany: company,
          profileRegion: region,
          profileCompletedAt: isComplete ? existing.profileCompletedAt ?? new Date() : null,
          profileRewardClaimed: shouldGrantReward ? true : existing.profileRewardClaimed,
        },
        select: {
          profileRealName: true,
          profileGender: true,
          profileAge: true,
          profileOccupation: true,
          profileCompany: true,
          profileRegion: true,
          profileCompletedAt: true,
          profileRewardClaimed: true,
        },
      });

      let rewardGranted = false;
      if (shouldGrantReward) {
        const account = await tx.creditAccount.upsert({
          where: { userId },
          create: {
            userId,
            balance: PROFILE_COMPLETION_REWARD_CREDITS,
            totalEarned: PROFILE_COMPLETION_REWARD_CREDITS,
          },
          update: {
            balance: { increment: PROFILE_COMPLETION_REWARD_CREDITS },
            totalEarned: { increment: PROFILE_COMPLETION_REWARD_CREDITS },
          },
        });

        await tx.creditTransaction.create({
          data: {
            accountId: account.id,
            type: 'PROFILE_COMPLETION_REWARD',
            amount: PROFILE_COMPLETION_REWARD_CREDITS,
            balanceBefore: account.balance - PROFILE_COMPLETION_REWARD_CREDITS,
            balanceAfter: account.balance,
            description: '完善资料奖励',
            metadata: { userId, source: 'profile_completion' },
            businessType: 'profile_completion',
          },
        });
        rewardGranted = true;
      }

      return { profile: this.mapExtendedProfile(updated), rewardGranted };
    });

    return {
      profile: result.profile,
      rewardGranted: result.rewardGranted,
      rewardCredits: result.rewardGranted ? PROFILE_COMPLETION_REWARD_CREDITS : 0,
    };
  }

  sanitize(user: any) {
    if (!user) return user;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
