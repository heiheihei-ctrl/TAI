import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { TEAM_PERMANENT_SEATS } from '../payment/dto/payment.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class TeamCoreService {
  constructor(private readonly prisma: PrismaService) {}

  async createPersonalTeam(userId: string, tx?: any) {
    const db = tx ?? this.prisma;
    const team = await db.team.create({
      data: {
        name: '我的工作区',
        ownerId: userId,
        isPersonal: true,
        maxSeats: 1,
        memberships: {
          create: { userId, role: 'owner' },
        },
        creditAccount: { create: {} },
      },
    });
    return team;
  }

  async createTeam(userId: string, dto: CreateTeamDto) {
    return this.prisma.team.create({
      data: {
        name: dto.name,
        ownerId: userId,
        isPersonal: false,
        maxSeats: 2,
        memberships: {
          create: { userId, role: 'owner' },
        },
        creditAccount: { create: {} },
      },
    });
  }

  async getSeatCapacity(teamId: string, db: any = this.prisma): Promise<number> {
    const team = await db.team.findUnique({
      where: { id: teamId },
      select: { isPersonal: true, maxSeats: true },
    });
    if (!team) throw new NotFoundException('团队不存在');
    if (team.isPersonal) return 1;
    // 购买套餐会写入 TeamSeatPackage；管理后台「修改席位」只更新 Team.maxSeats。
    // 两者都要生效，取较大值，避免后台加席后成员管理仍显示永久 2 席。
    const agg = await db.teamSeatPackage.aggregate({
      where: { teamId, status: 'active', expiresAt: { gt: new Date() } },
      _sum: { seats: true },
    });
    const fromPackages = TEAM_PERMANENT_SEATS + (agg._sum.seats ?? 0);
    const fromMaxSeats = Math.max(1, team.maxSeats ?? TEAM_PERMANENT_SEATS);
    return Math.max(fromMaxSeats, fromPackages);
  }

  async getMyTeams(userId: string) {
    const personal = await this.prisma.team.findFirst({
      where: { ownerId: userId, isPersonal: true },
      select: { id: true },
    });
    if (!personal) {
      await this.createPersonalTeam(userId);
    }
    const memberships = await this.prisma.teamMembership.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            _count: { select: { memberships: true } },
            creditAccount: { select: { balance: true, frozenBalance: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      ...m.team,
      myRole: m.role,
      memberCount: m.team._count.memberships,
      availableCredits:
        (m.team.creditAccount?.balance ?? 0) -
        (m.team.creditAccount?.frozenBalance ?? 0),
    }));
  }

  async getTeam(teamId: string, requestingUserId: string) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId: requestingUserId } },
    });
    if (!membership) throw new ForbiddenException('非团队成员');
    return this.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      include: { _count: { select: { memberships: true } } },
    });
  }

  async dissolveTeam(teamId: string, requestingUserId: string) {
    const team = await this.prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    if (team.isPersonal) throw new ForbiddenException('个人团队不可解散');
    if (team.ownerId !== requestingUserId) throw new ForbiddenException('仅 owner 可解散团队');

    await this.prisma.$transaction(async (tx) => {
      await tx.teamCreditAccount.updateMany({
        where: { teamId },
        data: { frozenBalance: 0 },
      });
      await tx.teamSubscription.updateMany({
        where: { teamId, status: 'active' },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      await tx.team.update({ where: { id: teamId }, data: { status: 'dissolved' } });
      await tx.teamMembership.deleteMany({ where: { teamId } });
      await tx.teamInvite.deleteMany({ where: { teamId } });
      await tx.teamProjectShare.deleteMany({ where: { teamId } });
    });
  }

  async getMembers(teamId: string, requestingUserId: string) {
    await this.assertMember(teamId, requestingUserId);
    return this.prisma.teamMembership.findMany({
      where: { teamId },
      include: { user: { select: { id: true, name: true, avatarUrl: true, email: true } } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async setMemberQuota(
    teamId: string,
    targetUserId: string,
    quota: { monthly?: number | null; total?: number | null },
    requestingUserId: string,
  ) {
    await this.assertRole(teamId, requestingUserId, ['owner', 'admin']);
    const team = await this.prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    if (team.isPersonal) throw new ForbiddenException('个人团队不支持成员配额');
    await this.prisma.teamMembership.findUniqueOrThrow({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });
    return this.prisma.teamMembership.update({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      data: {
        creditQuotaMonthly: quota.monthly,
        creditQuotaTotal: quota.total,
      },
    });
  }

  async updateMemberRole(
    teamId: string,
    targetUserId: string,
    role: 'admin' | 'member',
    requestingUserId: string,
  ) {
    await this.assertRole(teamId, requestingUserId, ['owner']);
    const team = await this.prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    if (team.isPersonal) throw new ForbiddenException('个人团队不可修改角色');
    if (targetUserId === requestingUserId) throw new BadRequestException('不可修改自己的角色');
    return this.prisma.teamMembership.update({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      data: { role },
    });
  }

  async removeMember(teamId: string, targetUserId: string, requestingUserId: string) {
    const team = await this.prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    if (team.isPersonal) throw new ForbiddenException('个人团队不可移除成员');

    if (targetUserId === requestingUserId) {
      return this.handleSelfLeave(team, targetUserId);
    }

    await this.assertRole(teamId, requestingUserId, ['owner', 'admin']);
    const target = await this.prisma.teamMembership.findUniqueOrThrow({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });
    if (target.role === 'owner') throw new ForbiddenException('不可移除 owner');
    await this.prisma.teamMembership.delete({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });
  }

  async transferOwnership(teamId: string, newOwnerId: string, requestingUserId: string) {
    const team = await this.prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    if (team.isPersonal) throw new ForbiddenException('个人团队不可转让');
    if (team.ownerId !== requestingUserId) throw new ForbiddenException('仅 owner 可转让');

    await this.prisma.$transaction(async (tx) => {
      const newOwnerMembership = await tx.teamMembership.findUnique({
        where: { teamId_userId: { teamId, userId: newOwnerId } },
      });
      if (!newOwnerMembership) throw new ForbiddenException('新 owner 不是团队成员');

      await tx.team.update({ where: { id: teamId }, data: { ownerId: newOwnerId } });
      await tx.teamMembership.update({
        where: { teamId_userId: { teamId, userId: requestingUserId } },
        data: { role: 'member' },
      });
      await tx.teamMembership.update({
        where: { teamId_userId: { teamId, userId: newOwnerId } },
        data: { role: 'owner' },
      });
    });
  }

  async assertMember(teamId: string, userId: string) {
    const m = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      include: { team: { select: { isPersonal: true } } },
    });
    if (!m) throw new ForbiddenException('非团队成员');
    return m;
  }

  async resolvePersonalTeamId(userId: string): Promise<string | null> {
    const team = await this.getPersonalTeam(userId);
    return team?.id ?? null;
  }

  async assertRole(teamId: string, userId: string, roles: string[]) {
    const m = await this.assertMember(teamId, userId);
    if (!roles.includes(m.role)) throw new ForbiddenException('权限不足');
    return m;
  }

  async getMyQuota(teamId: string, userId: string) {
    await this.assertMember(teamId, userId);
    const [membership, creditAccount] = await Promise.all([
      this.prisma.teamMembership.findUniqueOrThrow({
        where: { teamId_userId: { teamId, userId } },
        select: {
          creditQuotaMonthly: true,
          creditQuotaTotal: true,
          creditUsedThisCycle: true,
          creditUsedTotal: true,
          quotaCycleStartAt: true,
        },
      }),
      this.prisma.teamCreditAccount.findUnique({
        where: { teamId },
        select: { balance: true, frozenBalance: true },
      }),
    ]);

    const teamAvailableCredits =
      (creditAccount?.balance ?? 0) - (creditAccount?.frozenBalance ?? 0);

    const { creditQuotaMonthly, creditQuotaTotal, creditUsedThisCycle, creditUsedTotal } = membership;

    let personalAvailable: number | null = null;
    if (creditQuotaMonthly === null && creditQuotaTotal === null) {
      personalAvailable = null;
    } else {
      let remaining = Infinity;
      if (creditQuotaMonthly !== null) {
        remaining = Math.min(remaining, Math.max(0, creditQuotaMonthly - creditUsedThisCycle));
      }
      if (creditQuotaTotal !== null) {
        remaining = Math.min(remaining, Math.max(0, creditQuotaTotal - creditUsedTotal));
      }
      personalAvailable = Math.min(remaining, teamAvailableCredits);
    }

    return {
      creditQuotaMonthly,
      creditQuotaTotal,
      creditUsedThisCycle,
      creditUsedTotal,
      quotaCycleStartAt: membership.quotaCycleStartAt,
      teamAvailableCredits,
      personalAvailable,
    };
  }

  async getPersonalTeam(userId: string) {
    return this.prisma.team.findFirst({
      where: { ownerId: userId, isPersonal: true },
    });
  }

  private async handleSelfLeave(team: any, userId: string) {
    const members = await this.prisma.teamMembership.findMany({
      where: { teamId: team.id },
      orderBy: { createdAt: 'asc' },
    });

    if (members.length === 1) {
      await this.dissolveTeam(team.id, userId);
      return;
    }

    if (team.ownerId === userId) {
      const next =
        members.find((m) => m.role === 'admin' && m.userId !== userId) ||
        members.find((m) => m.userId !== userId);
      if (!next) throw new BadRequestException('无法确定新 owner');

      await this.prisma.$transaction([
        this.prisma.team.update({ where: { id: team.id }, data: { ownerId: next.userId } }),
        this.prisma.teamMembership.update({
          where: { teamId_userId: { teamId: team.id, userId: next.userId } },
          data: { role: 'owner' },
        }),
        this.prisma.teamMembership.delete({
          where: { teamId_userId: { teamId: team.id, userId } },
        }),
      ]);
      return;
    }

    await this.prisma.teamMembership.delete({
      where: { teamId_userId: { teamId: team.id, userId } },
    });
  }

  generateInviteCode(): string {
    return randomBytes(12).toString('base64url');
  }
}