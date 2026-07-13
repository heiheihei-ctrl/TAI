import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type TeamRole = 'owner' | 'admin' | 'member';

export interface TeamSummary {
  id: string;
  name: string;
  isPersonal: boolean;
  myRole: TeamRole;
  memberCount: number;
  availableCredits: number;
}

@Injectable()
export class TeamsService {
  private static readonly DEFAULT_TEAM_SEATS = 2;
  private static readonly INVITE_PREFIX = 'tai_';

  constructor(private readonly prisma: PrismaService) {}

  private generateInviteCode(): string {
    const suffix = randomBytes(12).toString('base64url');
    return `${TeamsService.INVITE_PREFIX}${suffix}`;
  }

  private displayName(user: { name: string | null; phone: string; id: string }): string {
    if (user.name?.trim()) return user.name.trim();
    const tail = user.id.slice(-6);
    return `用户-${tail}`;
  }

  private async ensurePersonalTeam(userId: string) {
    const existing = await this.prisma.team.findFirst({
      where: { ownerId: userId, isPersonal: true, status: 'active' },
      include: {
        members: true,
        creditAccount: true,
      },
    });
    if (existing) {
      if (existing.members.length === 0) {
        await this.prisma.teamMember.create({
          data: { teamId: existing.id, userId, role: 'owner' },
        });
      }
      if (!existing.creditAccount) {
        await this.prisma.teamCreditAccount.create({ data: { teamId: existing.id } });
      }
      return existing;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    return this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name: this.displayName(user),
          isPersonal: true,
          maxSeats: 1,
          ownerId: userId,
          members: {
            create: { userId, role: 'owner' },
          },
          creditAccount: {
            create: {},
          },
        },
        include: { members: true, creditAccount: true },
      });
      return team;
    });
  }

  private async getMembership(teamId: string, userId: string) {
    return this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      include: {
        team: {
          include: {
            creditAccount: true,
            members: { select: { id: true } },
          },
        },
      },
    });
  }

  private async assertCanManage(teamId: string, userId: string) {
    const membership = await this.getMembership(teamId, userId);
    if (!membership) throw new NotFoundException('团队不存在');
    if (membership.team.status !== 'active') throw new BadRequestException('团队已停用');
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      throw new ForbiddenException('无权操作');
    }
    return membership;
  }

  private toTeamSummary(
    team: {
      id: string;
      name: string;
      isPersonal: boolean;
      creditAccount: { balance: number } | null;
      members: { id: string }[];
    },
    myRole: TeamRole,
  ): TeamSummary {
    return {
      id: team.id,
      name: team.name,
      isPersonal: team.isPersonal,
      myRole,
      memberCount: team.members.length,
      availableCredits: team.creditAccount?.balance ?? 0,
    };
  }

  async listMyTeams(userId: string): Promise<TeamSummary[]> {
    await this.ensurePersonalTeam(userId);

    const memberships = await this.prisma.teamMember.findMany({
      where: {
        userId,
        team: { status: 'active' },
      },
      include: {
        team: {
          include: {
            creditAccount: true,
            members: { select: { id: true } },
          },
        },
      },
      orderBy: [{ team: { isPersonal: 'desc' } }, { team: { createdAt: 'asc' } }],
    });

    return memberships.map((m) =>
      this.toTeamSummary(m.team, m.role as TeamRole),
    );
  }

  async createTeam(userId: string, name: string): Promise<TeamSummary> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('团队名称不能为空');

    const team = await this.prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: {
          name: trimmed,
          isPersonal: false,
          maxSeats: TeamsService.DEFAULT_TEAM_SEATS,
          ownerId: userId,
          members: {
            create: { userId, role: 'owner' },
          },
          creditAccount: {
            create: {},
          },
        },
        include: {
          creditAccount: true,
          members: { select: { id: true } },
        },
      });
      return created;
    });

    return this.toTeamSummary(team, 'owner');
  }

  async getInviteInfo(code: string) {
    const invite = await this.prisma.teamInvite.findUnique({
      where: { code },
      include: { team: { select: { name: true, status: true, isPersonal: true } } },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      throw new NotFoundException('邀请链接无效或已过期');
    }
    if (invite.team.status !== 'active' || invite.team.isPersonal) {
      throw new NotFoundException('邀请链接无效或已过期');
    }
    return { teamName: invite.team.name };
  }

  async acceptInvite(userId: string, code: string) {
    const invite = await this.prisma.teamInvite.findUnique({
      where: { code },
      include: {
        team: {
          include: {
            members: { select: { userId: true } },
          },
        },
      },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      throw new NotFoundException('邀请链接无效或已过期');
    }
    if (invite.team.status !== 'active' || invite.team.isPersonal) {
      throw new NotFoundException('邀请链接无效或已过期');
    }

    const alreadyMember = invite.team.members.some((m) => m.userId === userId);
    if (alreadyMember) {
      return { teamId: invite.teamId };
    }

    if (invite.team.members.length >= invite.team.maxSeats) {
      throw new BadRequestException('团队席位已满');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.create({
        data: {
          teamId: invite.teamId,
          userId,
          role: 'member',
          creditQuotaMonthly: 50,
          creditQuotaTotal: 100,
          quotaCycleStart: new Date(),
        },
      });
      await tx.teamInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedBy: userId },
      });
    });

    return { teamId: invite.teamId };
  }

  async listMembers(teamId: string, userId: string) {
    const membership = await this.getMembership(teamId, userId);
    if (!membership) throw new NotFoundException('团队不存在');

    const members = await this.prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    return members.map((m) => ({
      userId: m.userId,
      role: m.role,
      user: {
        name: m.user.name || this.displayName(m.user),
        email: m.user.email || undefined,
      },
      creditQuotaMonthly: m.creditQuotaMonthly,
      creditQuotaTotal: m.creditQuotaTotal,
      creditUsedThisCycle: m.creditUsedThisCycle,
      creditUsedTotal: m.creditUsedTotal,
    }));
  }

  /** 当前用户在团队内的个人可用配额（受分配上限与团队积分池余额双重约束） */
  async getMyQuota(teamId: string, userId: string) {
    const membership = await this.getMembership(teamId, userId);
    if (!membership) throw new NotFoundException('团队不存在');
    if (membership.team.isPersonal) {
      return {
        available: null,
        unlimited: true,
        teamBalance: null,
        quotaRemaining: null,
        creditQuotaMonthly: null,
        creditQuotaTotal: null,
        creditUsedThisCycle: 0,
        creditUsedTotal: 0,
      };
    }

    const teamBalance = Math.max(
      0,
      membership.team.creditAccount?.balance ?? 0,
    );
    const monthly = membership.creditQuotaMonthly;
    const total = membership.creditQuotaTotal;
    const usedCycle = membership.creditUsedThisCycle ?? 0;
    const usedTotal = membership.creditUsedTotal ?? 0;
    const unlimited = monthly == null && total == null;

    const monthlyRemaining =
      monthly != null ? Math.max(0, monthly - usedCycle) : null;
    const totalRemaining =
      total != null ? Math.max(0, total - usedTotal) : null;

    let quotaRemaining: number | null = null;
    if (!unlimited) {
      const parts = [monthlyRemaining, totalRemaining].filter(
        (v): v is number => v != null,
      );
      quotaRemaining = parts.length > 0 ? Math.min(...parts) : 0;
    }

    // 实际可用 = min(个人分配剩余, 团队积分池余额)；无个人上限时仅受团队池约束
    const available =
      quotaRemaining != null
        ? Math.min(quotaRemaining, teamBalance)
        : teamBalance;

    return {
      available,
      unlimited,
      teamBalance,
      quotaRemaining,
      creditQuotaMonthly: monthly,
      creditQuotaTotal: total,
      creditUsedThisCycle: usedCycle,
      creditUsedTotal: usedTotal,
    };
  }

  async createInvite(teamId: string, userId: string, expiresInDays = 7) {
    await this.assertCanManage(teamId, userId);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: { select: { id: true } } },
    });
    if (!team || team.isPersonal) throw new BadRequestException('无法邀请加入此团队');
    if (team.members.length >= team.maxSeats) {
      throw new BadRequestException('团队席位已满，请先扩容');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    let code = this.generateInviteCode();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const invite = await this.prisma.teamInvite.create({
          data: {
            teamId,
            code,
            createdBy: userId,
            expiresAt,
          },
        });
        return { code: invite.code, expiresAt: invite.expiresAt.toISOString() };
      } catch {
        code = this.generateInviteCode();
      }
    }
    throw new BadRequestException('创建邀请失败，请重试');
  }

  async removeMember(teamId: string, actorUserId: string, targetUserId: string) {
    await this.assertCanManage(teamId, actorUserId);

    const target = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      include: { team: { select: { ownerId: true, isPersonal: true } } },
    });
    if (!target) throw new NotFoundException('成员不存在');
    if (target.team.isPersonal) throw new BadRequestException('无法修改个人团队');
    if (target.role === 'owner') throw new BadRequestException('无法移除团队所有者');
    if (targetUserId === actorUserId) throw new BadRequestException('无法移除自己');

    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });
  }

  async updateMemberRole(
    teamId: string,
    actorUserId: string,
    targetUserId: string,
    role: 'admin' | 'member',
  ) {
    const actor = await this.assertCanManage(teamId, actorUserId);
    if (actor.role !== 'owner') throw new ForbiddenException('仅所有者可调整角色');

    const target = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      include: { team: { select: { isPersonal: true } } },
    });
    if (!target) throw new NotFoundException('成员不存在');
    if (target.team.isPersonal) throw new BadRequestException('无法修改个人团队');
    if (target.role === 'owner') throw new BadRequestException('无法修改所有者角色');

    await this.prisma.teamMember.update({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      data: { role },
    });
  }

  async updateMemberQuota(
    teamId: string,
    actorUserId: string,
    targetUserId: string,
    quota: { monthly?: number | null; total?: number | null },
  ) {
    await this.assertCanManage(teamId, actorUserId);

    const target = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('成员不存在');
    if (target.role === 'owner') throw new BadRequestException('无法修改所有者配额');

    await this.prisma.teamMember.update({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      data: {
        ...(quota.monthly !== undefined ? { creditQuotaMonthly: quota.monthly } : {}),
        ...(quota.total !== undefined ? { creditQuotaTotal: quota.total } : {}),
      },
    });
  }

  async dissolveTeam(teamId: string, userId: string) {
    const membership = await this.getMembership(teamId, userId);
    if (!membership) throw new NotFoundException('团队不存在');
    if (membership.team.isPersonal) throw new BadRequestException('无法解散个人团队');
    if (membership.role !== 'owner') throw new ForbiddenException('仅所有者可解散团队');

    await this.prisma.$transaction(async (tx) => {
      await tx.project.updateMany({
        where: { teamId },
        data: { teamId: null },
      });
      await tx.team.update({
        where: { id: teamId },
        data: { status: 'dissolved' },
      });
    });
  }

  async assertTeamMember(teamId: string, userId: string) {
    const membership = await this.getMembership(teamId, userId);
    if (!membership || membership.team.status !== 'active') {
      throw new NotFoundException('团队不存在');
    }
    return membership;
  }

  async assertTeamManager(teamId: string, userId: string) {
    return this.assertCanManage(teamId, userId);
  }

  async resolvePersonalTeamId(userId: string): Promise<string> {
    const team = await this.ensurePersonalTeam(userId);
    return team.id;
  }
}
