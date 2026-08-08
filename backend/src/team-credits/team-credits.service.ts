import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamCoreService } from '../team-core/team-core.service';

@Injectable()
export class TeamCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamCore: TeamCoreService,
  ) {}

  async getAccount(teamId: string, requestingUserId: string) {
    await this.teamCore.assertMember(teamId, requestingUserId);
    const acc = await this.prisma.teamCreditAccount.findUniqueOrThrow({
      where: { teamId },
      include: {
        lots: {
          where: { remaining: { gt: 0 } },
          orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    return {
      ...acc,
      availableCredits: acc.balance - acc.frozenBalance,
    };
  }

  async getLedger(
    teamId: string,
    requestingUserId: string,
    take = 50,
    skip = 0,
    filters?: {
      dateFrom?: string | null;
      dateTo?: string | null;
      actorUserId?: string | null;
      search?: string | null;
    },
  ) {
    await this.teamCore.assertMember(teamId, requestingUserId);
    const acc = await this.prisma.teamCreditAccount.findUniqueOrThrow({ where: { teamId } });

    const where: any = { teamAccId: acc.id };
    if (filters?.actorUserId) {
      where.actorUserId = filters.actorUserId;
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters?.dateFrom) {
        where.createdAt.gte = new Date(filters.dateFrom);
      }
      if (filters?.dateTo) {
        // dateTo 视为当天的结束（含当天）
        const end = new Date(filters.dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    if (filters?.search && filters.search.trim()) {
      const kw = filters.search.trim();
      where.OR = [
        { note: { contains: kw, mode: 'insensitive' } },
        { taskKind: { contains: kw, mode: 'insensitive' } },
        { entryType: { contains: kw, mode: 'insensitive' } },
      ];
    }

    const entries = await this.prisma.teamCreditLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });

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

    return entries.map((e) => {
      const u = e.actorUserId ? userMap.get(e.actorUserId) : undefined;
      const phone = u?.phone?.trim() || '';
      return {
        ...e,
        actorName: u?.name?.trim() || null,
        actorPhoneTail: phone ? phone.slice(-4) : null,
      };
    });
  }

  async getMemberUsages(teamId: string, requestingUserId: string) {
    await this.teamCore.assertRole(teamId, requestingUserId, ['owner', 'admin']);
    return this.prisma.teamMembership.findMany({
      where: { teamId },
      select: {
        userId: true,
        role: true,
        creditQuotaMonthly: true,
        creditUsedThisCycle: true,
        quotaCycleStartAt: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    });
  }

  async setMemberQuota(teamId: string, targetUserId: string, quota: number | null, requestingUserId: string) {
    await this.teamCore.assertRole(teamId, requestingUserId, ['owner', 'admin']);
    return this.prisma.teamMembership.update({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      data: { creditQuotaMonthly: quota },
    });
  }

  async topupCredits(teamId: string, amount: number, sourceRefId: string) {
    if (amount <= 0) throw new BadRequestException('充值金额必须大于0');
    const acc = await this.prisma.teamCreditAccount.findUniqueOrThrow({ where: { teamId } });
    const expiresAt = new Date(Date.now() + 365 * 86400_000);

    await this.prisma.$transaction([
      this.prisma.teamCreditLot.create({
        data: {
          teamCreditAccId: acc.id,
          amount,
          remaining: amount,
          expiresAt,
          source: 'topup',
          sourceRefId,
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
          entryType: 'topup',
          amount,
          taskId: `topup_${sourceRefId}`,
          note: `充值 ${amount} 积分`,
        },
      }),
    ]);

    return { teamId, addedCredits: amount };
  }
}