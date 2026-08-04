import { BadRequestException, ForbiddenException, Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ApiResponseStatus } from '../credits/dto/credits.dto';
import {
  buildVolcengineMonthlySeries,
  VOLCENGINE_API_SERVICE_TYPES,
  VolcengineMonthlyCreditStat,
} from './volcengine-api-usage.util';

export interface ProfileDistributionItem {
  label: string;
  value: number;
  percentage: number;
}

export interface UserProfileDemographics {
  totalUsers: number;
  profiledUsers: number;
  completionRate: number;
  gender: ProfileDistributionItem[];
  age: ProfileDistributionItem[];
  occupation: ProfileDistributionItem[];
  regionByProvince: ProfileDistributionItem[];
  regionByCity: ProfileDistributionItem[];
  /** 用户来源渠道分布（填写渠道奖励） */
  sourceChannel: ProfileDistributionItem[];
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  dailyActiveUsers: number;
  /** 新用户日活跃数：当日活跃 ∩ 当日新注册 */
  newUserDailyActiveUsers: number;
  /** 老用户日活跃数：当日活跃中的非当日注册用户 */
  oldUserDailyActiveUsers: number;
  /** 次日留存率（0-100，保留 1 位小数）；按所选时段内可完整观测的注册日加权平均 */
  nextDayRetentionRate: number | null;
  /** 核心模型使用次数（时段内 ApiUsageRecord 原始调用次数，不去重） */
  coreModelUsageCount: number;
  onlineUsers: number;
  todayRegisteredUsers: number;
  totalCreditsInCirculation: number;
  totalCreditsSpent: number;
  totalApiCalls: number;
  successfulApiCalls: number;
  failedApiCalls: number;
  generatedAt: string;
  userTrend: Array<{
    date: string;
    registeredUsers: number;
    dailyActiveUsers: number;
    newUserDailyActiveUsers: number;
    oldUserDailyActiveUsers: number;
  }>;
  userProfileDemographics: UserProfileDemographics;
}

export interface UserWithCredits {
  id: string;
  email: string | null;
  phone: string;
  name: string | null;
  role: string;
  status: string;
  wechatBound: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  creditBalance: number;
  totalSpent: number;
  totalEarned: number;
  apiCallCount: number;
}

export interface ApiUsageStats {
  serviceType: string;
  serviceName: string;
  provider: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalCreditsUsed: number;
  userCount: number;
  topUsers: Array<{
    userId: string;
    userName: string | null;
    userPhone: string;
    userEmail: string | null;
    callCount: number;
  }>;
}

export type { VolcengineMonthlyCreditStat };

export type CreditChangeSource = 'recharge' | 'admin_add' | 'admin_deduct';

export interface CreditChangeRecord {
  id: string;
  source: CreditChangeSource;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdAt: Date;
  user: {
    id: string;
    phone: string;
    email: string | null;
    name: string | null;
  };
  admin: {
    id: string;
    phone: string;
    email: string | null;
    name: string | null;
  } | null;
  payment: {
    id: string;
    orderNo: string;
    amount: number;
    paymentMethod: string;
    paidAt: Date | null;
  } | null;
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  private toNumber(value: unknown): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private formatDayLabel(date: Date): string {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  private parseDateInput(value: string): Date | null {
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return null;
    }
    const [year, month, day] = trimmed.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return this.startOfDay(date);
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private buildDayStarts(start: Date, end: Date): Date[] {
    const days: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  resolveTrendRange(
    now: Date,
    trendStartDate?: string,
    trendEndDate?: string,
  ): { trendDayStarts: Date[] } {
    const startOfToday = this.startOfDay(now);
    const defaultTrendDays = 14;

    if (!trendStartDate && !trendEndDate) {
      const trendStart = new Date(startOfToday);
      trendStart.setDate(trendStart.getDate() - (defaultTrendDays - 1));
      return { trendDayStarts: this.buildDayStarts(trendStart, startOfToday) };
    }

    if (!trendStartDate || !trendEndDate) {
      throw new BadRequestException('趋势图日期筛选需同时提供开始日期和结束日期');
    }

    const trendStart = this.parseDateInput(trendStartDate);
    const trendEnd = this.parseDateInput(trendEndDate);
    if (!trendStart || !trendEnd) {
      throw new BadRequestException('日期格式无效，请使用 YYYY-MM-DD');
    }
    if (trendStart > trendEnd) {
      throw new BadRequestException('开始日期不能晚于结束日期');
    }

    const maxTrendDays = 90;
    const dayCount =
      Math.floor((trendEnd.getTime() - trendStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (dayCount > maxTrendDays) {
      throw new BadRequestException(`日期范围不能超过 ${maxTrendDays} 天`);
    }

    return { trendDayStarts: this.buildDayStarts(trendStart, trendEnd) };
  }

  private asJsonObject(value: unknown): Record<string, any> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, any>;
    }
    return null;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async runWithMissingTableTolerance<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2021'
      ) {
        return null;
      }
      throw error;
    }
  }

  /** 当日活跃用户：RefreshToken 会话 或 lastLoginAt（去重） */
  async queryDayActivityBreakdown(
    dayStart: Date,
    dayEnd: Date,
  ): Promise<{
    dailyActiveUsers: number;
    newUserDailyActiveUsers: number;
    oldUserDailyActiveUsers: number;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        dau: bigint | number | string;
        new_dau: bigint | number | string;
        old_dau: bigint | number | string;
      }>
    >`
      WITH active AS (
        SELECT DISTINCT id FROM (
          SELECT "userId" AS id
          FROM "RefreshToken"
          WHERE "createdAt" >= ${dayStart} AND "createdAt" < ${dayEnd}
          UNION
          SELECT id
          FROM "User"
          WHERE "lastLoginAt" >= ${dayStart} AND "lastLoginAt" < ${dayEnd}
        ) t
      )
      SELECT
        COUNT(*)::bigint AS dau,
        COUNT(*) FILTER (
          WHERE u."createdAt" >= ${dayStart} AND u."createdAt" < ${dayEnd}
        )::bigint AS new_dau,
        COUNT(*) FILTER (
          WHERE u."createdAt" < ${dayStart}
        )::bigint AS old_dau
      FROM active a
      INNER JOIN "User" u ON u.id = a.id
    `;
    const row = rows[0];
    return {
      dailyActiveUsers: this.toNumber(row?.dau ?? 0),
      newUserDailyActiveUsers: this.toNumber(row?.new_dau ?? 0),
      oldUserDailyActiveUsers: this.toNumber(row?.old_dau ?? 0),
    };
  }

  /**
   * 次日留存：dayStart 当天注册用户中，在次日仍有活跃的占比
   * 返回 cohortSize / returnedCount，供加权汇总
   */
  async queryNextDayRetentionCohort(
    dayStart: Date,
  ): Promise<{ cohortSize: number; returnedCount: number }> {
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const nextEnd = new Date(dayEnd);
    nextEnd.setDate(nextEnd.getDate() + 1);

    const rows = await this.prisma.$queryRaw<
      Array<{ cohort_size: bigint | number | string; returned_count: bigint | number | string }>
    >`
      WITH cohort AS (
        SELECT id
        FROM "User"
        WHERE "createdAt" >= ${dayStart} AND "createdAt" < ${dayEnd}
      ),
      returned AS (
        SELECT DISTINCT c.id
        FROM cohort c
        WHERE EXISTS (
          SELECT 1
          FROM "RefreshToken" rt
          WHERE rt."userId" = c.id
            AND rt."createdAt" >= ${dayEnd}
            AND rt."createdAt" < ${nextEnd}
        )
        OR EXISTS (
          SELECT 1
          FROM "User" u
          WHERE u.id = c.id
            AND u."lastLoginAt" >= ${dayEnd}
            AND u."lastLoginAt" < ${nextEnd}
        )
      )
      SELECT
        (SELECT COUNT(*)::bigint FROM cohort) AS cohort_size,
        (SELECT COUNT(*)::bigint FROM returned) AS returned_count
    `;
    const row = rows[0];
    return {
      cohortSize: this.toNumber(row?.cohort_size ?? 0),
      returnedCount: this.toNumber(row?.returned_count ?? 0),
    };
  }

  /**
   * 获取管理后台统计数据
   */
  async getDashboardStats(options?: {
    trendStartDate?: string;
    trendEndDate?: string;
  }): Promise<AdminDashboardStats> {
    const now = new Date();
    const startOfToday = this.startOfDay(now);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const onlineThreshold = new Date(now.getTime() - 15 * 60 * 1000);
    const { trendDayStarts } = this.resolveTrendRange(
      now,
      options?.trendStartDate,
      options?.trendEndDate,
    );
    const periodStart = trendDayStarts[0] ?? startOfToday;
    const periodEndExclusive = new Date(trendDayStarts[trendDayStarts.length - 1] ?? startOfToday);
    periodEndExclusive.setDate(periodEndExclusive.getDate() + 1);

    const [
      totalUsers,
      onlineUsers,
      creditStats,
      apiStats,
      coreModelUsageCount,
      trendRows,
      retentionCohorts,
      profileRows,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          status: 'active',
          lastLoginAt: {
            gte: onlineThreshold,
          },
        },
      }),
      this.prisma.creditAccount.aggregate({
        _sum: {
          balance: true,
          totalSpent: true,
        },
      }),
      this.prisma.apiUsageRecord.groupBy({
        by: ['responseStatus'],
        _count: true,
      }),
      this.prisma.apiUsageRecord.count({
        where: {
          createdAt: {
            gte: periodStart,
            lt: periodEndExclusive,
          },
        },
      }),
      Promise.all(
        trendDayStarts.map(async (dayStart) => {
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);
          const [registeredUsers, activity] = await Promise.all([
            this.prisma.user.count({
              where: {
                createdAt: {
                  gte: dayStart,
                  lt: dayEnd,
                },
              },
            }),
            this.queryDayActivityBreakdown(dayStart, dayEnd),
          ]);
          return {
            date: this.formatDayLabel(dayStart),
            registeredUsers,
            dailyActiveUsers: activity.dailyActiveUsers,
            newUserDailyActiveUsers: activity.newUserDailyActiveUsers,
            oldUserDailyActiveUsers: activity.oldUserDailyActiveUsers,
          };
        }),
      ),
      Promise.all(
        trendDayStarts.map(async (dayStart) => {
          const nextDayEnd = new Date(dayStart);
          nextDayEnd.setDate(nextDayEnd.getDate() + 2);
          // 次日尚未结束则无法观测完整留存
          if (nextDayEnd > now) {
            return { cohortSize: 0, returnedCount: 0, measurable: false as const };
          }
          const cohort = await this.queryNextDayRetentionCohort(dayStart);
          return { ...cohort, measurable: true as const };
        }),
      ),
      this.prisma.user.findMany({
        select: {
          profileGender: true,
          profileBirthday: true,
          profileOccupation: true,
          profileRegion: true,
          profileCompletedAt: true,
          sourceChannel: true,
        },
      }),
    ]);

    const totalApiCalls = apiStats.reduce((sum, item) => sum + item._count, 0);
    const successfulApiCalls =
      apiStats.find((s) => s.responseStatus === ApiResponseStatus.SUCCESS)?._count || 0;
    const failedApiCalls =
      apiStats.find((s) => s.responseStatus === ApiResponseStatus.FAILED)?._count || 0;

    const userTrend = trendRows;

    const periodRegisteredUsers = userTrend.reduce(
      (sum, item) => sum + item.registeredUsers,
      0,
    );
    const avg = (values: number[]) =>
      values.length <= 1
        ? values[0] ?? 0
        : Math.round(values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1));

    const periodDailyActiveUsers = avg(userTrend.map((item) => item.dailyActiveUsers));
    const periodNewUserDailyActiveUsers = avg(
      userTrend.map((item) => item.newUserDailyActiveUsers),
    );
    const periodOldUserDailyActiveUsers = avg(
      userTrend.map((item) => item.oldUserDailyActiveUsers),
    );

    const measurableCohorts = retentionCohorts.filter((item) => item.measurable);
    const retentionCohortSize = measurableCohorts.reduce(
      (sum, item) => sum + item.cohortSize,
      0,
    );
    const retentionReturnedCount = measurableCohorts.reduce(
      (sum, item) => sum + item.returnedCount,
      0,
    );
    const nextDayRetentionRate =
      retentionCohortSize > 0
        ? Math.round((retentionReturnedCount / retentionCohortSize) * 1000) / 10
        : null;

    return {
      totalUsers,
      activeUsers: periodDailyActiveUsers,
      dailyActiveUsers: periodDailyActiveUsers,
      newUserDailyActiveUsers: periodNewUserDailyActiveUsers,
      oldUserDailyActiveUsers: periodOldUserDailyActiveUsers,
      nextDayRetentionRate,
      coreModelUsageCount,
      onlineUsers,
      todayRegisteredUsers: periodRegisteredUsers,
      totalCreditsInCirculation: creditStats._sum.balance || 0,
      totalCreditsSpent: creditStats._sum.totalSpent || 0,
      totalApiCalls,
      successfulApiCalls,
      failedApiCalls,
      generatedAt: now.toISOString(),
      userTrend,
      userProfileDemographics: this.buildUserProfileDemographics(profileRows, totalUsers, now),
    };
  }

  private buildUserProfileDemographics(
    rows: Array<{
      profileGender: string | null;
      profileBirthday: Date | null;
      profileOccupation: string | null;
      profileRegion: string | null;
      profileCompletedAt: Date | null;
      sourceChannel: string | null;
    }>,
    totalUsers: number,
    now: Date,
  ): UserProfileDemographics {
    const profiledUsers = rows.filter((row) => row.profileCompletedAt).length;
    const genderCounts = new Map<string, number>();
    const ageCounts = new Map<string, number>();
    const occupationCounts = new Map<string, number>();
    const provinceCounts = new Map<string, number>();
    const cityCounts = new Map<string, number>();
    const sourceChannelCounts = new Map<string, number>();

    for (const row of rows) {
      const genderKey = this.normalizeGenderLabel(row.profileGender);
      genderCounts.set(genderKey, (genderCounts.get(genderKey) ?? 0) + 1);

      const ageKey = this.getAgeBucket(this.computeAge(row.profileBirthday, now));
      ageCounts.set(ageKey, (ageCounts.get(ageKey) ?? 0) + 1);

      const occupationKey = this.normalizeOccupationLabel(row.profileOccupation);
      occupationCounts.set(occupationKey, (occupationCounts.get(occupationKey) ?? 0) + 1);

      const { province, city } = this.parseRegionParts(row.profileRegion);
      const provinceKey = province || '未填写';
      provinceCounts.set(provinceKey, (provinceCounts.get(provinceKey) ?? 0) + 1);

      const cityKey =
        province && city ? `${province} / ${city}` : province ? `${province}（未选市）` : '未填写';
      cityCounts.set(cityKey, (cityCounts.get(cityKey) ?? 0) + 1);

      const sourceChannelKey = this.normalizeSourceChannelLabel(row.sourceChannel);
      sourceChannelCounts.set(
        sourceChannelKey,
        (sourceChannelCounts.get(sourceChannelKey) ?? 0) + 1,
      );
    }

    return {
      totalUsers,
      profiledUsers,
      completionRate:
        totalUsers > 0 ? Math.round((profiledUsers / totalUsers) * 1000) / 10 : 0,
      gender: this.finalizeDistribution(
        this.toDistribution(genderCounts, totalUsers, ['男', '女', '其他', '未填写']),
      ),
      age: this.finalizeDistribution(
        this.toDistribution(ageCounts, totalUsers, [
          '18岁以下',
          '18-30岁',
          '30-50岁',
          '50岁以上',
          '未填写',
        ]),
      ),
      occupation: this.finalizeDistribution(
        this.toTopDistribution(occupationCounts, totalUsers, 12, '未填写'),
      ),
      regionByProvince: this.finalizeDistribution(
        this.toTopDistribution(provinceCounts, totalUsers, 15, '未填写'),
      ),
      regionByCity: this.finalizeDistribution(
        this.toTopDistribution(cityCounts, totalUsers, 12, '未填写'),
      ),
      sourceChannel: this.finalizeDistribution(
        this.toDistribution(sourceChannelCounts, totalUsers, [
          '小红书',
          '抖音',
          '视频号',
          'B站',
          '公众号',
          '朋友推荐',
          'AI搜索',
          '其他渠道',
          '未填写',
        ]),
      ),
    };
  }

  normalizeSourceChannelLabel(value: string | null | undefined): string {
    const trimmed = String(value || '').trim();
    const allowed = new Set([
      '小红书',
      '抖音',
      '视频号',
      'B站',
      '公众号',
      '朋友推荐',
      'AI搜索',
      '其他渠道',
    ]);
    if (allowed.has(trimmed)) return trimmed;
    return '未填写';
  }

  private computeAge(birthday: Date | null, now: Date): number | null {
    if (!birthday) return null;
    let age = now.getFullYear() - birthday.getFullYear();
    const monthDiff = now.getMonth() - birthday.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthday.getDate())) {
      age -= 1;
    }
    return age;
  }

  private getAgeBucket(age: number | null): string {
    if (age === null || age < 0) return '未填写';
    if (age < 18) return '18岁以下';
    if (age <= 30) return '18-30岁';
    if (age <= 50) return '30-50岁';
    return '50岁以上';
  }

  private normalizeGenderLabel(value: string | null | undefined): string {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'male') return '男';
    if (normalized === 'female') return '女';
    if (normalized === 'other') return '其他';
    return '未填写';
  }

  private normalizeOccupationLabel(value: string | null | undefined): string {
    const trimmed = String(value || '').trim();
    return trimmed || '未填写';
  }

  private parseRegionParts(value: string | null | undefined): { province: string; city: string } {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return { province: '', city: '' };
    }
    const separator = trimmed.includes(' / ') ? ' / ' : '/';
    const parts = trimmed.split(separator).map((part) => part.trim()).filter(Boolean);
    return {
      province: parts[0] || '',
      city: parts[1] || '',
    };
  }

  private toDistribution(
    counts: Map<string, number>,
    total: number,
    preferredOrder?: string[],
  ): ProfileDistributionItem[] {
    const entries = Array.from(counts.entries());
    const sorted = preferredOrder
      ? preferredOrder
          .filter((label) => counts.has(label))
          .map((label) => [label, counts.get(label) ?? 0] as const)
      : entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));

    return sorted.map(([label, value]) => ({
      label,
      value,
      percentage: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    }));
  }

  private toTopDistribution(
    counts: Map<string, number>,
    total: number,
    topN: number,
    emptyLabel: string,
  ): ProfileDistributionItem[] {
    const ranked = Array.from(counts.entries())
      .filter(([label]) => label !== emptyLabel)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));

    const top = ranked.slice(0, topN);
    const otherCount =
      ranked.slice(topN).reduce((sum, [, value]) => sum + value, 0);

    const ordered: Array<[string, number]> = [];
    for (const item of top) {
      ordered.push(item);
    }
    if (otherCount > 0) {
      ordered.push(['其他', otherCount]);
    }

    return ordered.map(([label, value]) => ({
      label,
      value,
      percentage: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    }));
  }

  private finalizeDistribution(
    items: ProfileDistributionItem[],
  ): ProfileDistributionItem[] {
    const filtered = items.filter(
      (item) => item.label !== '未填写' && item.value > 0,
    );
    const sum = filtered.reduce((acc, item) => acc + item.value, 0);
    return filtered.map((item) => ({
      ...item,
      percentage: sum > 0 ? Math.round((item.value / sum) * 1000) / 10 : 0,
    }));
  }

  /**
   * 获取所有用户列表（带积分信息）
   */
  async getAllUsers(options: {
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{ users: UserWithCredits[]; pagination: any }> {
    const { page = 1, pageSize = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = options;

    const where: any = {};
    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { email: { contains: search } },
        { name: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          creditAccount: true,
          _count: {
            select: { apiUsageRecords: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    const usersWithCredits: UserWithCredits[] = users.map((user: any) => ({
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      status: user.status,
      wechatBound: Boolean(user.wechatOfficialOpenId || user.wechatUnionId),
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      creditBalance: user.creditAccount?.balance || 0,
      totalSpent: user.creditAccount?.totalSpent || 0,
      totalEarned: user.creditAccount?.totalEarned || 0,
      apiCallCount: user._count.apiUsageRecords,
    }));

    return {
      users: usersWithCredits,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 获取单个用户详情
   */
  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        creditAccount: {
          include: {
            transactions: {
              orderBy: { createdAt: 'desc' },
              take: 50,
            },
          },
        },
        apiUsageRecords: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      status: user.status,
      wechatOfficialOpenId: user.wechatOfficialOpenId,
      wechatUnionId: user.wechatUnionId,
      wechatBound: Boolean(user.wechatOfficialOpenId || user.wechatUnionId),
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      creditAccount: user.creditAccount,
      recentApiUsage: user.apiUsageRecords.map((record) => ({
        ...record,
        processingTime:
          record.processingTime == null ? null : Number(record.processingTime),
      })),
    };
  }

  /**
   * 获取积分变更记录（充值 + 后台手动调整）
   * 注意：source='all_earned' 可以查询所有类型的积分增加记录，包括邀请奖励、签到奖励等
   */
  async getCreditChangeRecords(options: {
    page?: number;
    pageSize?: number;
    search?: string;
    userId?: string;
    source?: 'all' | 'recharge' | 'admin_add' | 'admin_deduct' | 'invite_reward' | 'all_earned';
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{ records: CreditChangeRecord[]; pagination: any }> {
    const {
      page = 1,
      pageSize = 20,
      search,
      userId,
      source = 'all',
      startDate,
      endDate,
    } = options;

    const where: any = {};

    if (source === 'recharge') {
      where.OR = [{ type: 'earn', description: '充值' }];
    } else if (source === 'admin_add') {
      where.OR = [{ type: 'admin_adjust', amount: { gt: 0 } }];
    } else if (source === 'admin_deduct') {
      where.OR = [{ type: 'admin_adjust', amount: { lt: 0 } }];
    } else if (source === 'invite_reward') {
      where.OR = [{ type: 'REFERRAL_REWARD' }];
      where.amount = { gt: 0 };
    } else if (source === 'all_earned') {
      // 查询所有类型的积分增加记录（包括邀请奖励、签到奖励等）
      where.OR = [
        { type: 'earn', description: '充值' },
        { type: 'admin_adjust', amount: { gt: 0 } },
        { type: 'REFERRAL_REWARD' }, // 邀请奖励
        { type: 'CHECK_IN' }, // 签到奖励
        { type: 'earn', description: '新用户注册赠送积分' }, // 新用户注册赠送
      ];
      where.amount = { gt: 0 }; // 只查询积分增加的记录
    } else {
      where.OR = [
        { type: 'earn', description: '充值' },
        { type: 'admin_adjust' },
      ];
    }

    if (userId) {
      const account = await this.prisma.creditAccount.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!account) {
        return {
          records: [],
          pagination: {
            page,
            pageSize,
            total: 0,
            totalPages: 0,
          },
        };
      }
      where.accountId = account.id;
    } else if (search) {
      const matchedUsers = await this.prisma.user.findMany({
        where: {
          OR: [
            { phone: { contains: search } },
            { email: { contains: search } },
            { name: { contains: search } },
          ],
        },
        select: { id: true },
      });

      const matchedUserIds = matchedUsers.map((u) => u.id);
      if (matchedUserIds.length === 0) {
        return {
          records: [],
          pagination: {
            page,
            pageSize,
            total: 0,
            totalPages: 0,
          },
        };
      }

      const matchedAccounts = await this.prisma.creditAccount.findMany({
        where: {
          userId: { in: matchedUserIds },
        },
        select: { id: true },
      });

      const matchedAccountIds = matchedAccounts.map((a) => a.id);
      if (matchedAccountIds.length === 0) {
        return {
          records: [],
          pagination: {
            page,
            pageSize,
            total: 0,
            totalPages: 0,
          },
        };
      }

      where.accountId = { in: matchedAccountIds };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [transactions, total] = await Promise.all([
      this.prisma.creditTransaction.findMany({
        where,
        include: {
          account: {
            include: {
              user: {
                select: {
                  id: true,
                  phone: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.creditTransaction.count({ where }),
    ]);

    const adminIds = new Set<string>();
    const paymentRefs = new Set<string>();

    for (const tx of transactions) {
      const metadata = this.asJsonObject(tx.metadata);
      if (tx.type === 'admin_adjust') {
        const adminId = metadata?.adminId;
        if (typeof adminId === 'string' && adminId.length > 0) {
          adminIds.add(adminId);
        }
      }
      if (tx.type === 'earn' && tx.description === '充值') {
        const orderRef = metadata?.orderNo;
        if (typeof orderRef === 'string' && orderRef.length > 0) {
          paymentRefs.add(orderRef);
        }
      }
    }

    const paymentRefsArray = Array.from(paymentRefs);
    const paymentIdRefs = paymentRefsArray.filter((ref) => this.isUuid(ref));
    const paymentOrderNoRefs = paymentRefsArray.filter((ref) => !this.isUuid(ref));
    const paymentWhereOr: Array<Record<string, any>> = [];
    if (paymentIdRefs.length > 0) {
      paymentWhereOr.push({ id: { in: paymentIdRefs } });
    }
    if (paymentOrderNoRefs.length > 0) {
      paymentWhereOr.push({ orderNo: { in: paymentOrderNoRefs } });
    }

    const [admins, paymentOrders] = await Promise.all([
      adminIds.size > 0
        ? this.prisma.user.findMany({
            where: { id: { in: Array.from(adminIds) } },
            select: {
              id: true,
              phone: true,
              email: true,
              name: true,
            },
          })
        : Promise.resolve([]),
      paymentWhereOr.length > 0
        ? this.prisma.paymentOrder.findMany({
            where: {
              OR: paymentWhereOr,
            },
            select: {
              id: true,
              orderNo: true,
              amount: true,
              paymentMethod: true,
              paidAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const adminMap = new Map(admins.map((a) => [a.id, a]));
    const paymentById = new Map(paymentOrders.map((p) => [p.id, p]));
    const paymentByOrderNo = new Map(paymentOrders.map((p) => [p.orderNo, p]));

    const records: CreditChangeRecord[] = transactions.map((tx) => {
      const metadata = this.asJsonObject(tx.metadata);
      const user = tx.account.user;

      let recordSource: CreditChangeSource = 'recharge';
      if (tx.type === 'admin_adjust') {
        recordSource = tx.amount >= 0 ? 'admin_add' : 'admin_deduct';
      } else if (tx.type === 'REFERRAL_REWARD') {
        recordSource = 'recharge'; // 邀请奖励显示为充值类型，但会在description中标注
      } else if (tx.type === 'CHECK_IN') {
        recordSource = 'recharge'; // 签到奖励显示为充值类型，但会在description中标注
      } else if (tx.type === 'earn' && tx.description === '新用户注册赠送积分') {
        recordSource = 'recharge'; // 新用户注册赠送显示为充值类型
      }

      const adminId = typeof metadata?.adminId === 'string' ? metadata.adminId : null;
      const admin = adminId ? adminMap.get(adminId) ?? null : null;

      const paymentRef = typeof metadata?.orderNo === 'string' ? metadata.orderNo : null;
      const paymentOrder = paymentRef
        ? paymentById.get(paymentRef) ?? paymentByOrderNo.get(paymentRef) ?? null
        : null;

      return {
        id: tx.id,
        source: recordSource,
        amount: tx.amount,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        description: tx.description,
        createdAt: tx.createdAt,
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          name: user.name,
        },
        admin: admin
          ? {
              id: admin.id,
              phone: admin.phone,
              email: admin.email,
              name: admin.name,
            }
          : null,
        payment: paymentOrder
          ? {
              id: paymentOrder.id,
              orderNo: paymentOrder.orderNo,
              amount: Number(paymentOrder.amount),
              paymentMethod: paymentOrder.paymentMethod,
              paidAt: paymentOrder.paidAt,
            }
          : null,
      };
    });

    return {
      records,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 获取 API 使用统计（按服务类型分组）
   */
  async getApiUsageStats(options: {
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<ApiUsageStats[]> {
    const { startDate, endDate } = options;

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const stats = await this.prisma.apiUsageRecord.groupBy({
      by: ['serviceType', 'serviceName', 'provider', 'responseStatus'],
      where,
      _count: true,
      _sum: {
        creditsUsed: true,
      },
    });

    // 聚合数据
    const aggregated = new Map<string, ApiUsageStats>();

    stats.forEach((item) => {
      const key = item.serviceType;
      if (!aggregated.has(key)) {
        aggregated.set(key, {
          serviceType: item.serviceType,
          serviceName: item.serviceName,
          provider: item.provider,
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          totalCreditsUsed: 0,
          userCount: 0,
          topUsers: [],
        });
      }

      const stat = aggregated.get(key)!;
      stat.totalCalls += item._count;
      stat.totalCreditsUsed += item._sum.creditsUsed || 0;

      if (item.responseStatus === ApiResponseStatus.SUCCESS) {
        stat.successfulCalls += item._count;
      } else if (item.responseStatus === ApiResponseStatus.FAILED) {
        stat.failedCalls += item._count;
      }
    });

    // 一次性获取所有服务类型的用户统计信息
    const result = Array.from(aggregated.values());
    const serviceTypes = result.map(s => s.serviceType);
    
    if (serviceTypes.length > 0) {
      // 获取所有服务类型的用户统计
      const allUserStats = await this.prisma.apiUsageRecord.groupBy({
        by: ['userId', 'serviceType'],
        where: {
          ...where,
          serviceType: { in: serviceTypes },
        },
        _count: true,
      });

      // 获取所有相关用户信息
      const allUserIds = [...new Set(allUserStats.map(s => s.userId))];
      const allUsers = await this.prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      });

      const userMap = new Map(allUsers.map(u => [u.id, u]));
      
      // 按服务类型分组用户统计
      const userStatsByService = new Map<string, Array<{ userId: string; callCount: number }>>();
      
      allUserStats.forEach(stat => {
        if (!userStatsByService.has(stat.serviceType)) {
          userStatsByService.set(stat.serviceType, []);
        }
        userStatsByService.get(stat.serviceType)!.push({
          userId: stat.userId,
          callCount: stat._count,
        });
      });

      // 为每个服务类型填充用户信息
      result.forEach(stat => {
        const userStats = userStatsByService.get(stat.serviceType) || [];
        const uniqueUserIds = [...new Set(userStats.map(s => s.userId))];
        
        // 按调用次数排序，取前5个
        const topUserStats = userStats
          .sort((a, b) => b.callCount - a.callCount)
          .slice(0, 5);

        stat.userCount = uniqueUserIds.length;
        stat.topUsers = topUserStats.map(uc => {
          const user = userMap.get(uc.userId);
          return {
            userId: uc.userId,
            userName: user?.name || null,
            userPhone: user?.phone || '',
            userEmail: user?.email || null,
            callCount: uc.callCount,
          };
        });
      });
    }

    return result;
  }

  /**
   * 火山引擎相关 API 月度积分消耗（Seedance / Seedream 方舟 / 视频增强）
   */
  async getVolcengineMonthlyCreditStats(options: {
    months?: number;
  } = {}): Promise<VolcengineMonthlyCreditStat[]> {
    const months = Math.min(36, Math.max(1, options.months ?? 12));
    const startDate = new Date();
    startDate.setUTCDate(1);
    startDate.setUTCHours(0, 0, 0, 0);
    startDate.setUTCMonth(startDate.getUTCMonth() - (months - 1));

    const rows = await this.prisma.$queryRaw<
      Array<{ month: string; totalCredits: bigint | number; totalCalls: bigint | number }>
    >(Prisma.sql`
      SELECT
        to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
        COALESCE(SUM("creditsUsed"), 0) AS "totalCredits",
        COUNT(*)::bigint AS "totalCalls"
      FROM "ApiUsageRecord"
      WHERE "createdAt" >= ${startDate}
        AND (
          "serviceType" IN (${Prisma.join(
            VOLCENGINE_API_SERVICE_TYPES.map((type) => Prisma.sql`${type}`),
          )})
          AND (
            "serviceType" <> 'doubao-seedream-5-0-260128'
            OR COALESCE(
              "requestParams"->>'seedream5Provider',
              "requestParams"->>'upstreamProvider',
              "requestParams"->>'channel',
              'doubao'
            ) <> 'watcha'
          )
        )
      GROUP BY date_trunc('month', "createdAt")
      ORDER BY month ASC
    `);

    return buildVolcengineMonthlySeries(
      rows.map((row) => ({
        month: row.month,
        totalCredits: this.toNumber(row.totalCredits),
        totalCalls: this.toNumber(row.totalCalls),
      })),
      months,
    );
  }

  /**
   * 获取所有 API 使用记录
   */
  async getAllApiUsageRecords(options: {
    page?: number;
    pageSize?: number;
    userId?: string;
    userSearch?: string;
    serviceType?: string;
    provider?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}) {
    const { page = 1, pageSize = 10, userId, userSearch, serviceType, provider, status, startDate, endDate } = options;

    const where: any = {};
    if (userId) where.userId = userId;
    else if (userSearch?.trim()) {
      const keyword = userSearch.trim();
      where.OR = [
        { userId: { contains: keyword, mode: 'insensitive' } },
        { user: { is: { phone: { contains: keyword, mode: 'insensitive' } } } },
        { user: { is: { email: { contains: keyword, mode: 'insensitive' } } } },
        { user: { is: { name: { contains: keyword, mode: 'insensitive' } } } },
      ];
    }
    if (serviceType) where.serviceType = serviceType;
    if (provider) where.provider = provider;
    if (status) where.responseStatus = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [records, total] = await Promise.all([
      this.prisma.apiUsageRecord.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.apiUsageRecord.count({ where }),
    ]);

    // processingTime 为 BigInt，直接 JSON 序列化会抛错导致 500
    const serializedRecords = records.map((record) => ({
      ...record,
      processingTime:
        record.processingTime == null ? null : Number(record.processingTime),
    }));

    return {
      records: serializedRecords,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 更新用户状态
   */
  async updateUserStatus(userId: string, status: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });
  }

  async unbindUserWechat(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        name: true,
        wechatOfficialOpenId: true,
        wechatUnionId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (!user.wechatOfficialOpenId && !user.wechatUnionId) {
      return {
        success: true,
        message: '该用户当前未绑定微信',
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        wechatOfficialOpenId: null,
        wechatUnionId: null,
      },
      select: { id: true },
    });

    return {
      success: true,
      message: '微信绑定已解除',
    };
  }

  /**
   * 更新用户角色
   */
  async updateUserRole(userId: string, role: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });
  }

  /**
   * 删除用户账号及关联数据
   */
  async deleteUserAccount(userId: string, operatorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      });

      if (!targetUser) {
        throw new NotFoundException('用户不存在');
      }

      if (userId === operatorId) {
        throw new ForbiddenException('不能删除当前登录管理员账号');
      }

      if (targetUser.role === 'admin') {
        const adminCount = await tx.user.count({ where: { role: 'admin' } });
        if (adminCount <= 1) {
          throw new BadRequestException('系统至少需要保留一个管理员账号');
        }
      }

      await tx.user.updateMany({
        where: { invitedById: userId },
        data: { invitedById: null },
      });

      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.workflowHistory.deleteMany({ where: { userId } });
      await tx.project.deleteMany({ where: { userId } });

      const account = await tx.creditAccount.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (account) {
        await this.runWithMissingTableTolerance(() =>
          tx.creditAnomalyRecord.deleteMany({ where: { accountId: account.id } }),
        );
        await tx.creditTransaction.deleteMany({ where: { accountId: account.id } });
        await tx.creditLot.deleteMany({ where: { accountId: account.id } });
        await tx.creditAccount.delete({ where: { id: account.id } });
      }

      await this.runWithMissingTableTolerance(() =>
        tx.creditAnomalyRecord.deleteMany({ where: { userId } }),
      );
      await tx.membershipSubscriptionChange.deleteMany({ where: { userId } });
      await tx.userMembershipSubscription.deleteMany({ where: { userId } });
      await tx.membershipEntitlementSnapshot.deleteMany({ where: { userId } });
      await tx.apiUsageRecord.deleteMany({ where: { userId } });
      await tx.globalImageHistory.deleteMany({ where: { userId } });

      await tx.invitationRedemption.deleteMany({
        where: {
          OR: [{ inviteeUserId: userId }, { inviterUserId: userId }],
        },
      });
      await tx.invitationCode.updateMany({
        where: { inviterUserId: userId },
        data: { inviterUserId: null },
      });

      await tx.paymentOrder.deleteMany({ where: { userId } });
      await tx.imageTask.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });

      return {
        success: true,
        deletedUserId: userId,
      };
    });
  }

  // ==================== 系统设置 ====================

  /**
   * 获取所有系统设置
   */
  async getAllSettings() {
    return this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  /**
   * 获取单个系统设置
   */
  async getSetting(key: string) {
    return this.prisma.systemSetting.findUnique({
      where: { key },
    });
  }

  /**
   * 更新或创建系统设置
   */
  async upsertSetting(
    key: string,
    value: string,
    updatedBy: string,
    description?: string,
    metadata?: Record<string, any>,
  ) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      update: {
        value,
        updatedBy,
        description: description ?? undefined,
        metadata: metadata ?? undefined,
      },
      create: {
        key,
        value,
        description,
        metadata,
        updatedBy,
      },
    });
  }

  /**
   * 删除系统设置
   */
  async deleteSetting(key: string) {
    return this.prisma.systemSetting.delete({
      where: { key },
    });
  }

  // ==================== 水印白名单管理 ====================

  /**
   * 获取水印白名单用户列表
   */
  async getWatermarkWhitelist(options: {
    page?: number;
    pageSize?: number;
    search?: string;
  } = {}) {
    const { page = 1, pageSize = 10, search } = options;

    const where: any = { noWatermark: true };
    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { email: { contains: search } },
        { name: { contains: search } },
      ];
      where.noWatermark = true;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          phone: true,
          email: true,
          name: true,
          noWatermark: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 添加用户到水印白名单
   */
  async addToWatermarkWhitelist(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { noWatermark: true },
      select: { id: true, phone: true, name: true, noWatermark: true },
    });
  }

  /**
   * 从水印白名单移除用户
   */
  async removeFromWatermarkWhitelist(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { noWatermark: false },
      select: { id: true, phone: true, name: true, noWatermark: true },
    });
  }

  /**
   * 检查用户是否在水印白名单中
   */
  async checkWatermarkWhitelist(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { noWatermark: true },
    });
    return user?.noWatermark ?? false;
  }

  // ==================== 付费用户管理 ====================

  /**
   * 获取付费用户列表（支持金额/注册时间/支付时间排序）
   */
  async getPaidUsers(options: {
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: 'amount' | 'registeredAt' | 'paidAt';
    sortOrder?: 'asc' | 'desc';
  } = {}) {
    const { page = 1, pageSize = 10, search } = options;
    const sortBy = options.sortBy ?? 'amount';
    const sortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';
    const direction = sortOrder === 'asc' ? 1 : -1;

    const compareWithDirection = (a: number, b: number) => {
      if (a === b) return 0;
      return a > b ? direction : -direction;
    };

    const compareNullableDate = (a: Date | null, b: Date | null) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return compareWithDirection(a.getTime(), b.getTime());
    };

    // 先获取所有有支付记录的用户及其总支付金额
    const paidUsersQuery = await this.prisma.paymentOrder.groupBy({
      by: ['userId'],
      where: {
        status: 'paid',
      },
      _sum: {
        amount: true,
      },
      _max: {
        paidAt: true,
        createdAt: true,
      },
      _count: {
        id: true,
      },
    });

    // 获取用户ID列表
    const userIds = paidUsersQuery.map(p => p.userId);

    if (userIds.length === 0) {
      return {
        users: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 0,
        },
      };
    }

    // 构建搜索条件
    const where: any = {
      id: { in: userIds },
    };
    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { email: { contains: search } },
        { name: { contains: search } },
      ];
    }

    // 获取符合搜索条件的用户
    const filteredUsers = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        phone: true,
        email: true,
        name: true,
        role: true,
        status: true,
        noWatermark: true,
        createdAt: true,
        lastLoginAt: true,
        creditAccount: {
          select: {
            balance: true,
            totalSpent: true,
            totalEarned: true,
          },
        },
      },
    });

    // 创建用户ID到支付信息的映射
    const paymentMap = new Map(
      paidUsersQuery.map(p => [
        p.userId,
        {
          totalPaid: Number(p._sum.amount) || 0,
          orderCount: p._count.id,
          lastPaidAt: p._max.paidAt ?? p._max.createdAt ?? null,
        },
      ])
    );

    // 合并用户信息和支付信息，并按总支付金额排序
    const usersWithPayment = filteredUsers
      .map(user => ({
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        noWatermark: user.noWatermark,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        creditBalance: user.creditAccount?.balance || 0,
        totalSpent: user.creditAccount?.totalSpent || 0,
        totalEarned: user.creditAccount?.totalEarned || 0,
        totalPaid: paymentMap.get(user.id)?.totalPaid || 0,
        orderCount: paymentMap.get(user.id)?.orderCount || 0,
        lastPaidAt: paymentMap.get(user.id)?.lastPaidAt || null,
      }))
      .sort((a, b) => {
        if (sortBy === 'registeredAt') {
          const byRegisteredAt = compareWithDirection(
            a.createdAt.getTime(),
            b.createdAt.getTime(),
          );
          if (byRegisteredAt !== 0) return byRegisteredAt;
        } else if (sortBy === 'paidAt') {
          const byPaidAt = compareNullableDate(a.lastPaidAt, b.lastPaidAt);
          if (byPaidAt !== 0) return byPaidAt;
        } else {
          const byAmount = compareWithDirection(a.totalPaid, b.totalPaid);
          if (byAmount !== 0) return byAmount;
        }

        // 保持结果稳定，避免分页时同值抖动
        return a.id.localeCompare(b.id);
      });

    // 分页
    const total = usersWithPayment.length;
    const totalPages = Math.ceil(total / pageSize);
    const paginatedUsers = usersWithPayment.slice(
      (page - 1) * pageSize,
      page * pageSize
    );

    return {
      users: paginatedUsers,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  // ── 团队管理 ─────────────────────────────────────────────────────

  async adminCreateEnterprise(params: {
    name: string;
    ownerPhone: string;
    ownerPassword?: string;
    ownerName?: string;
    maxSeats?: number;
  }) {
    const name = String(params.name || '').trim();
    const phone = String(params.ownerPhone || '').trim();
    if (name.length < 2) throw new BadRequestException('企业名称至少 2 个字符');
    if (!/^1\d{10}$/.test(phone)) throw new BadRequestException('管理员手机号格式不正确');

    const maxSeats = Math.max(2, Number(params.maxSeats) || 10);
    let owner = await this.prisma.user.findUnique({ where: { phone } });

    if (!owner) {
      const password = String(params.ownerPassword || '').trim();
      if (password.length < 6) {
        throw new BadRequestException('新建管理员账号时，初始密码至少 6 位');
      }
      const passwordHash = await bcrypt.hash(password, 10);
      owner = await this.prisma.user.create({
        data: {
          phone,
          passwordHash,
          name: params.ownerName?.trim() || `企业管理员_${phone.slice(-4)}`,
          role: 'user',
          status: 'active',
        },
      });
    } else if (params.ownerPassword?.trim()) {
      const passwordHash = await bcrypt.hash(params.ownerPassword.trim(), 10);
      owner = await this.prisma.user.update({
        where: { id: owner.id },
        data: {
          passwordHash,
          ...(params.ownerName?.trim() ? { name: params.ownerName.trim() } : {}),
        },
      });
    }

    const personal = await this.prisma.team.findFirst({
      where: { ownerId: owner.id, isPersonal: true },
      select: { id: true },
    });
    if (!personal) {
      await this.prisma.team.create({
        data: {
          name: '我的工作区',
          ownerId: owner.id,
          isPersonal: true,
          maxSeats: 1,
          memberships: { create: { userId: owner.id, role: 'owner' } },
          creditAccount: { create: {} },
        },
      });
    }

    const team = await this.prisma.team.create({
      data: {
        name,
        displayName: name,
        ownerId: owner.id,
        isPersonal: false,
        enterpriseEnabled: true,
        maxSeats,
        memberships: { create: { userId: owner.id, role: 'owner' } },
        creditAccount: { create: {} },
      },
      include: {
        owner: { select: { id: true, name: true, phone: true, email: true } },
        _count: { select: { memberships: true } },
      },
    });

    const enterprise = await this.prisma.enterprise.create({
      data: {
        name,
        displayName: name,
        ownerId: owner.id,
        workspaceTeamId: team.id,
        maxSeats,
        status: 'active',
      },
    });

    return {
      id: team.id,
      enterpriseId: enterprise.id,
      name: team.name,
      displayName: team.displayName,
      ownerId: team.ownerId,
      owner: team.owner,
      maxSeats: team.maxSeats,
      memberCount: team._count.memberships,
      usedSeats: team._count.memberships,
      projectCount: 0,
      status: team.status,
      enterpriseEnabled: true,
      createdAt: enterprise.createdAt,
    };
  }

  async adminListTeams(params: {
    search?: string;
    page: number;
    pageSize: number;
  }) {
    const { search, page = 1, pageSize = 20 } = params;

    // 企业列表：读独立 Enterprise 表，不再把普通 Team/项目壳当企业
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { displayName: { contains: search } },
        { owner: { phone: { contains: search } } },
        { owner: { email: { contains: search } } },
        { owner: { name: { contains: search } } },
      ];
    }

    const [enterprises, total] = await Promise.all([
      this.prisma.enterprise.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, phone: true, email: true } },
          workspaceTeam: {
            include: {
              _count: { select: { memberships: true, projects: true } },
              creditAccount: { select: { balance: true, frozenBalance: true } },
            },
          },
          _count: { select: { projects: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.enterprise.count({ where }),
    ]);

    return {
      teams: enterprises.map((ent) => {
        const team = ent.workspaceTeam;
        const memberCount = team?._count?.memberships ?? 0;
        const projectCount = ent._count.projects || team?._count?.projects || 0;
        const balance = team?.creditAccount?.balance || 0;
        const frozenBalance = team?.creditAccount?.frozenBalance || 0;
        return {
          id: team?.id || ent.workspaceTeamId,
          enterpriseId: ent.id,
          name: ent.name,
          displayName: ent.displayName ?? ent.name,
          enterpriseEnabled: true,
          ownerId: ent.ownerId,
          owner: ent.owner,
          maxSeats: ent.maxSeats,
          memberCount,
          usedSeats: memberCount,
          projectCount,
          status: ent.status,
          balance,
          frozenBalance,
          availableCredits: balance - frozenBalance,
          createdAt: ent.createdAt,
          updatedAt: ent.updatedAt,
        };
      }),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async adminListProjects(params: {
    search?: string;
    scope?: 'all' | 'personal' | 'enterprise';
    enterpriseId?: string;
    page: number;
    pageSize: number;
  }) {
    const { search, scope = 'all', enterpriseId, page = 1, pageSize = 20 } = params;
    const where: any = {};
    const and: any[] = [];

    if (scope === 'personal') {
      and.push({ enterpriseId: null });
      and.push({ OR: [{ teamId: null }, { team: { isPersonal: true } }] });
    } else if (scope === 'enterprise') {
      and.push({ enterpriseId: { not: null } });
    }
    if (enterpriseId) and.push({ enterpriseId });
    if (search) {
      and.push({
        OR: [
          { name: { contains: search } },
          { user: { phone: { contains: search } } },
          { user: { name: { contains: search } } },
          { enterprise: { name: { contains: search } } },
        ],
      });
    }
    if (and.length) where.AND = and;

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        select: {
          id: true,
          name: true,
          userId: true,
          teamId: true,
          enterpriseId: true,
          thumbnailUrl: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, phone: true, email: true } },
          team: { select: { id: true, name: true, isPersonal: true, enterpriseEnabled: true } },
          enterprise: { select: { id: true, name: true, displayName: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      projects: projects.map((p) => ({
        ...p,
        scope: p.enterpriseId
          ? 'enterprise'
          : p.team?.isPersonal || !p.teamId
            ? 'personal'
            : 'team',
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async adminDeleteProject(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('项目不存在');
    await this.prisma.project.delete({ where: { id: projectId } });
    return { success: true, id: projectId };
  }

  async adminAssignProjectEnterprise(projectId: string, enterpriseId: string | null) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('项目不存在');

    if (!enterpriseId) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { enterpriseId: null },
      });
      return { success: true, id: projectId, enterpriseId: null };
    }

    const enterprise = await this.prisma.enterprise.findUnique({
      where: { id: enterpriseId },
      select: { id: true, workspaceTeamId: true },
    });
    if (!enterprise) throw new NotFoundException('企业不存在');

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        enterpriseId: enterprise.id,
        teamId: enterprise.workspaceTeamId,
      },
    });
    return {
      success: true,
      id: projectId,
      enterpriseId: enterprise.id,
      teamId: enterprise.workspaceTeamId,
    };
  }

  async adminGetTeamMembers(teamId: string) {
    const memberships = await this.prisma.teamMembership.findMany({
      where: { teamId },
      include: {
        user: { select: { id: true, name: true, phone: true, email: true, avatarUrl: true } },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    return memberships.map((m) => ({
      userId: m.userId,
      role: m.role,
      creditQuotaMonthly: m.creditQuotaMonthly,
      creditQuotaTotal: m.creditQuotaTotal,
      creditUsedThisCycle: m.creditUsedThisCycle,
      creditUsedTotal: m.creditUsedTotal,
      quotaCycleStartAt: m.quotaCycleStartAt,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      user: m.user,
    }));
  }

  async adminAddTeamCredits(
    teamId: string,
    amount: number,
    description: string,
    adminUserId: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('充值金额必须大于0');
    }

    const acc = await this.prisma.teamCreditAccount.findUnique({
      where: { teamId },
    });

    if (!acc) {
      throw new NotFoundException('团队积分账户不存在');
    }

    const expiresAt = new Date(Date.now() + 365 * 86400_000);

    await this.prisma.$transaction([
      this.prisma.teamCreditLot.create({
        data: {
          teamCreditAccId: acc.id,
          amount,
          remaining: amount,
          expiresAt,
          source: 'admin_add',
          sourceRefId: `admin_${adminUserId}_${Date.now()}`,
        },
      }),
      this.prisma.teamCreditAccount.update({
        where: { id: acc.id },
        data: {
          balance: { increment: amount },
          totalEarned: { increment: amount },
        },
      }),
      this.prisma.teamCreditLedger.create({
        data: {
          teamAccId: acc.id,
          entryType: 'admin_add',
          amount,
          actorUserId: adminUserId,
          note: description || `管理员添加 ${amount} 积分`,
        },
      }),
    ]);

    return { success: true, teamId, addedCredits: amount };
  }

  async adminDeductTeamCredits(
    teamId: string,
    amount: number,
    description: string,
    adminUserId: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('扣除金额必须大于0');
    }

    const acc = await this.prisma.teamCreditAccount.findUnique({
      where: { teamId },
    });

    if (!acc) {
      throw new NotFoundException('团队积分账户不存在');
    }

    if (acc.balance < amount) {
      throw new BadRequestException('团队积分余额不足');
    }

    await this.prisma.$transaction([
      this.prisma.teamCreditAccount.update({
        where: { id: acc.id },
        data: {
          balance: { decrement: amount },
          totalSpent: { increment: amount },
        },
      }),
      this.prisma.teamCreditLedger.create({
        data: {
          teamAccId: acc.id,
          entryType: 'admin_deduct',
          amount: -amount,
          actorUserId: adminUserId,
          note: description || `管理员扣除 ${amount} 积分`,
        },
      }),
    ]);

    return { success: true, teamId, deductedCredits: amount };
  }

  async adminUpdateTeamSeats(teamId: string, maxSeats: number) {
    if (maxSeats < 1) {
      throw new BadRequestException('席位数必须大于0');
    }

    const [team] = await this.prisma.$transaction([
      this.prisma.team.update({
        where: { id: teamId },
        data: { maxSeats },
        select: { id: true, name: true, maxSeats: true },
      }),
      this.prisma.enterprise.updateMany({
        where: { workspaceTeamId: teamId },
        data: { maxSeats },
      }),
    ]);
    return team;
  }

  async adminUpdateTeamStatus(teamId: string, status: string) {
    const validStatuses = ['active', 'suspended', 'dissolved'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`状态必须是 ${validStatuses.join(', ')} 之一`);
    }

    const [team] = await this.prisma.$transaction([
      this.prisma.team.update({
        where: { id: teamId },
        data: { status },
        select: { id: true, name: true, status: true },
      }),
      this.prisma.enterprise.updateMany({
        where: { workspaceTeamId: teamId },
        data: { status },
      }),
    ]);
    return team;
  }

  async adminDeleteTeam(teamId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('团队不存在');
    }

    if (team.isPersonal) {
      throw new ForbiddenException('个人团队不可删除');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.teamCreditAccount.deleteMany({ where: { teamId } });
      await tx.teamCreditLedger.deleteMany({ where: { teamAccId: { in: [] } } });
      await tx.teamCreditLot.deleteMany({ where: { teamCreditAccId: { in: [] } } });
      await tx.teamSubscription.updateMany({
        where: { teamId, status: 'active' },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      await tx.teamSeatPackage.deleteMany({ where: { teamId } });
      await tx.teamProjectShare.deleteMany({ where: { teamId } });
      await tx.teamInvite.deleteMany({ where: { teamId } });
      await tx.teamMembership.deleteMany({ where: { teamId } });
      await tx.team.delete({ where: { id: teamId } });
    });

    return { success: true, teamId };
  }

  async adminGetTeamCreditHistory(
    teamId: string,
    page: number,
    pageSize: number,
  ) {
    const acc = await this.prisma.teamCreditAccount.findUnique({ where: { teamId } });
    if (!acc) {
      return {
        records: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      };
    }

    const [entries, total] = await Promise.all([
      this.prisma.teamCreditLedger.findMany({
        where: { teamAccId: acc.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.teamCreditLedger.count({ where: { teamAccId: acc.id } }),
    ]);

    const actorIds = Array.from(
      new Set(entries.map((e) => e.actorUserId).filter((id): id is string => !!id)),
    );
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, phone: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      records: entries.map((e) => {
        const u = e.actorUserId ? userMap.get(e.actorUserId) : undefined;
        return {
          id: e.id,
          entryType: e.entryType,
          amount: e.amount,
          taskId: e.taskId,
          taskKind: e.taskKind,
          actorUserId: e.actorUserId,
          actorName: u?.name || null,
          actorPhone: u?.phone || null,
          note: e.note,
          createdAt: e.createdAt,
        };
      }),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
