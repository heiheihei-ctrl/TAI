import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateExtendedProfileDto } from './dto/update-extended-profile.dto';

export const PROFILE_COMPLETION_REWARD_CREDITS = 100;

export const VALID_SOURCE_CHANNELS = [
  '小红书',
  '抖音',
  '视频号',
  'B站',
  '公众号',
  '朋友推荐',
  'AI搜索',
  '其他渠道',
] as const;

export interface ExtendedProfileView {
  realName: string | null;
  nickname: string | null;
  gender: string | null;
  birthday: string | null;
  email: string | null;
  occupation: string | null;
  company: string | null;
  region: string | null;
  sourceChannel: string | null;
  isComplete: boolean;
  rewardClaimed: boolean;
  rewardCredits: number;
  completedAt: string | null;
}

export interface UpdateExtendedProfileDtoInput {
  realName?: string;
  nickname?: string;
  gender?: string;
  birthday?: string;
  email?: string;
  occupation?: string;
  company?: string;
  region?: string;
  sourceChannel?: string | null;
}

export interface UpdateGoogleApiKeyDto {
  googleCustomApiKey?: string | null;
  googleKeyMode?: 'official' | 'custom';
}

export interface UpdateProfileDto {
  name?: string;
  avatarUrl?: string | null;
}

const AUTH_USER_SELECT = {
  id: true,
  email: true,
  phone: true,
  passwordHash: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
      select: AUTH_USER_SELECT,
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findAuthUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: AUTH_USER_SELECT,
    });
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

  async createAdminUser(phone: string, plainPassword = 'tai2026') {
    const existingUser = await this.findByPhone(phone);
    if (existingUser) {
      throw new BadRequestException('手机号已被使用');
    }
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    return this.prisma.user.create({
      data: {
        phone,
        passwordHash,
        name: `用户_${phone.substring(phone.length - 4)}`
      },
      select: AUTH_USER_SELECT,
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
        profileNickname: true,
        profileGender: true,
        profileBirthday: true,
        profileEmail: true,
        profileOccupation: true,
        profileCompany: true,
        profileRegion: true,
        profileCompletedAt: true,
        profileRewardClaimed: true,
      },
    });
  }

  private formatBirthday(value: Date | null | undefined): string | null {
    if (!value) return null;
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseBirthdayInput(value: string): Date {
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException('生日格式无效');
    }
    const [yearText, monthText, dayText] = trimmed.split('-');
    const year = Number.parseInt(yearText, 10);
    const month = Number.parseInt(monthText, 10);
    const day = Number.parseInt(dayText, 10);
    const birthday = new Date(Date.UTC(year, month - 1, day));
    if (
      birthday.getUTCFullYear() !== year ||
      birthday.getUTCMonth() !== month - 1 ||
      birthday.getUTCDate() !== day
    ) {
      throw new BadRequestException('生日日期无效');
    }
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    if (birthday.getTime() > todayUtc) {
      throw new BadRequestException('生日不能晚于今天');
    }
    const minYear = today.getFullYear() - 120;
    if (year < minYear) {
      throw new BadRequestException('生日无效');
    }
    return birthday;
  }

  private normalizeSourceChannel(value?: string | null): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed || null;
  }

  private assertValidSourceChannel(value: string | null): void {
    if (value && !VALID_SOURCE_CHANNELS.includes(value as (typeof VALID_SOURCE_CHANNELS)[number])) {
      throw new BadRequestException('无效的渠道来源');
    }
  }

  private mapExtendedProfile(user: {
    profileRealName?: string | null;
    profileNickname?: string | null;
    profileGender?: string | null;
    profileBirthday?: Date | null;
    profileEmail?: string | null;
    profileOccupation?: string | null;
    profileCompany?: string | null;
    profileRegion?: string | null;
    sourceChannel?: string | null;
    profileCompletedAt?: Date | null;
    profileRewardClaimed?: boolean | null;
  }): ExtendedProfileView {
    const realName = user.profileRealName?.trim() || null;
    const nickname = user.profileNickname?.trim() || null;
    const gender = user.profileGender?.trim() || null;
    const birthday = this.formatBirthday(user.profileBirthday);
    const email = user.profileEmail?.trim().toLowerCase() || null;
    const occupation = user.profileOccupation?.trim() || null;
    const company = user.profileCompany?.trim() || null;
    const region = user.profileRegion?.trim() || null;
    const isComplete = Boolean(
      realName &&
        nickname &&
        gender &&
        birthday &&
        email &&
        occupation &&
        company &&
        region,
    );

    return {
      realName,
      nickname,
      gender,
      birthday,
      email,
      occupation,
      company,
      region,
      sourceChannel: this.normalizeSourceChannel(user.sourceChannel),
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
        profileNickname: true,
        profileGender: true,
        profileBirthday: true,
        profileEmail: true,
        profileOccupation: true,
        profileCompany: true,
        profileRegion: true,
        sourceChannel: true,
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
    const result = await this.prisma.$transaction(async (tx) => {
      // 锁用户行，避免并发保存重复发放完善资料奖励
      await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`,
      );

      const existing = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          profileRealName: true,
          profileNickname: true,
          profileGender: true,
          profileBirthday: true,
          profileEmail: true,
          profileOccupation: true,
          profileCompany: true,
          profileRegion: true,
          sourceChannel: true,
          profileCompletedAt: true,
          profileRewardClaimed: true,
        },
      });
      if (!existing) {
        throw new NotFoundException('用户不存在');
      }

      const sourceChannel =
        dto.sourceChannel !== undefined
          ? this.normalizeSourceChannel(dto.sourceChannel)
          : this.normalizeSourceChannel(existing.sourceChannel);
      this.assertValidSourceChannel(sourceChannel);

      const realName = (dto.realName ?? existing.profileRealName ?? '').trim();
      const nickname = (dto.nickname ?? existing.profileNickname ?? '').trim();
      const gender = (dto.gender ?? existing.profileGender ?? '').trim();
      const birthdayInput =
        dto.birthday !== undefined
          ? dto.birthday
          : this.formatBirthday(existing.profileBirthday);
      const email = (dto.email ?? existing.profileEmail ?? '').trim().toLowerCase();
      const occupation = (dto.occupation ?? existing.profileOccupation ?? '').trim();
      const company = (dto.company ?? existing.profileCompany ?? '').trim();
      const region = (dto.region ?? existing.profileRegion ?? '').trim();

      // 保存接口不允许提交空字段：无法通过「清空再填写」绕过
      if (
        !realName ||
        !nickname ||
        !gender ||
        !birthdayInput ||
        !email ||
        !occupation ||
        !company ||
        !region
      ) {
        throw new BadRequestException(
          '请填写完整资料：姓名、昵称、性别、生日、邮箱、职业、公司与所在地区',
        );
      }

      const birthday = this.parseBirthdayInput(birthdayInput);
      // 发奖唯一依据：永久标记 profileRewardClaimed，与字段是否曾经为空无关
      const shouldGrantReward = !existing.profileRewardClaimed;
      const profileCompletedAt = existing.profileCompletedAt ?? new Date();
      const profileRewardClaimed =
        existing.profileRewardClaimed || shouldGrantReward;

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          profileRealName: realName,
          profileNickname: nickname,
          profileGender: gender,
          profileBirthday: birthday,
          profileEmail: email,
          profileOccupation: occupation,
          profileCompany: company,
          profileRegion: region,
          sourceChannel,
          // 一旦完成/领奖，不再回写为 null / false
          profileCompletedAt,
          profileRewardClaimed,
        },
        select: {
          profileRealName: true,
          profileNickname: true,
          profileGender: true,
          profileBirthday: true,
          profileEmail: true,
          profileOccupation: true,
          profileCompany: true,
          profileRegion: true,
          sourceChannel: true,
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
