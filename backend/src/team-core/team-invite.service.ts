import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamCoreService } from './team-core.service';
import { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class TeamInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamCore: TeamCoreService,
  ) {}

  async createInvite(teamId: string, inviterUserId: string, dto: InviteMemberDto) {
    const team = await this.prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    if (team.isPersonal) throw new ForbiddenException('个人工作区不可邀请成员');
    await this.teamCore.assertRole(teamId, inviterUserId, ['owner', 'admin']);

    const code = this.teamCore.generateInviteCode();
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 86400_000)
      : null;

    return this.prisma.teamInvite.create({
      data: {
        teamId,
        code,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        inviterUserId,
        expiresAt,
      },
    });
  }

  async listInvites(teamId: string, requestingUserId: string) {
    await this.teamCore.assertRole(teamId, requestingUserId, ['owner', 'admin']);
    return this.prisma.teamInvite.findMany({
      where: { teamId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(inviteId: string, teamId: string, requestingUserId: string) {
    await this.teamCore.assertRole(teamId, requestingUserId, ['owner', 'admin']);
    const invite = await this.prisma.teamInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.teamId !== teamId) throw new NotFoundException('邀请不存在');
    return this.prisma.teamInvite.update({
      where: { id: inviteId },
      data: { status: 'revoked' },
    });
  }

  async getInviteInfo(code: string) {
    const invite = await this.findValidInvite(code);
    return {
      teamId: invite.teamId,
      teamName: invite.team.displayName || invite.team.name,
      expiresAt: invite.expiresAt,
    };
  }

  /** 提交加入申请（不再立刻成为成员） */
  async applyByCode(code: string, applicantUserId: string, message?: string) {
    const invite = await this.findValidInvite(code);
    return this.createJoinRequest({
      teamId: invite.teamId,
      inviteId: invite.id,
      applicantUserId,
      message,
    });
  }

  async applyByCodeBody(code: string, applicantUserId: string, message?: string) {
    return this.applyByCode(code, applicantUserId, message);
  }

  async listJoinRequests(teamId: string, requestingUserId: string) {
    await this.teamCore.assertRole(teamId, requestingUserId, ['owner', 'admin']);
    return this.prisma.teamJoinRequest.findMany({
      where: { teamId },
      include: {
        applicant: {
          select: { id: true, name: true, phone: true, email: true, avatarUrl: true },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async approveJoinRequest(teamId: string, requestId: string, reviewerUserId: string) {
    await this.teamCore.assertRole(teamId, reviewerUserId, ['owner', 'admin']);

    const request = await this.prisma.teamJoinRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.teamId !== teamId) throw new NotFoundException('申请不存在');
    if (request.status !== 'pending') throw new BadRequestException('申请已处理');

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.teamMembership.findUnique({
        where: {
          teamId_userId: { teamId, userId: request.applicantUserId },
        },
      });
      if (existing) {
        await tx.teamJoinRequest.update({
          where: { id: requestId },
          data: {
            status: 'approved',
            reviewedById: reviewerUserId,
            reviewedAt: new Date(),
          },
        });
        return;
      }

      const memberCount = await tx.teamMembership.count({ where: { teamId } });
      const seatLimit = await this.teamCore.getSeatCapacity(teamId, tx);
      if (memberCount >= seatLimit) throw new BadRequestException('企业席位已满');

      await tx.teamMembership.create({
        data: {
          teamId,
          userId: request.applicantUserId,
          role: 'member',
        },
      });

      await tx.teamJoinRequest.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          reviewedById: reviewerUserId,
          reviewedAt: new Date(),
        },
      });

      if (request.inviteId) {
        await tx.teamInvite.updateMany({
          where: { id: request.inviteId, status: 'pending' },
          data: {
            status: 'accepted',
            acceptedUserId: request.applicantUserId,
            acceptedAt: new Date(),
          },
        });
      }
    });

    return { ok: true, teamId, userId: request.applicantUserId };
  }

  async rejectJoinRequest(teamId: string, requestId: string, reviewerUserId: string) {
    await this.teamCore.assertRole(teamId, reviewerUserId, ['owner', 'admin']);
    const request = await this.prisma.teamJoinRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.teamId !== teamId) throw new NotFoundException('申请不存在');
    if (request.status !== 'pending') throw new BadRequestException('申请已处理');

    await this.prisma.teamJoinRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        reviewedById: reviewerUserId,
        reviewedAt: new Date(),
      },
    });

    return { ok: true };
  }

  /** @deprecated 保留兼容：改为提交申请 */
  async acceptInvite(code: string, acceptingUserId: string) {
    return this.applyByCode(code, acceptingUserId);
  }

  private async createJoinRequest(params: {
    teamId: string;
    inviteId?: string | null;
    applicantUserId: string;
    message?: string;
  }) {
    const team = await this.prisma.team.findUniqueOrThrow({
      where: { id: params.teamId },
    });
    if (team.isPersonal) throw new ForbiddenException('个人工作区不可申请加入');
    if (team.status !== 'active') throw new BadRequestException('企业已停用');

    const existingMember = await this.prisma.teamMembership.findUnique({
      where: {
        teamId_userId: {
          teamId: params.teamId,
          userId: params.applicantUserId,
        },
      },
    });
    if (existingMember) throw new BadRequestException('您已是该企业成员');

    const pending = await this.prisma.teamJoinRequest.findFirst({
      where: {
        teamId: params.teamId,
        applicantUserId: params.applicantUserId,
        status: 'pending',
      },
    });
    if (pending) {
      return {
        requestId: pending.id,
        teamId: params.teamId,
        status: 'pending',
        message: '您已提交过申请，请等待管理员审核',
      };
    }

    const memberCount = await this.prisma.teamMembership.count({
      where: { teamId: params.teamId },
    });
    const seatLimit = await this.teamCore.getSeatCapacity(params.teamId);
    if (memberCount >= seatLimit) throw new BadRequestException('企业席位已满');

    const created = await this.prisma.teamJoinRequest.create({
      data: {
        teamId: params.teamId,
        inviteId: params.inviteId || null,
        applicantUserId: params.applicantUserId,
        message: params.message?.trim() || null,
        status: 'pending',
      },
    });

    return {
      requestId: created.id,
      teamId: params.teamId,
      status: 'pending',
      message: '申请已提交，等待企业管理员审核',
    };
  }

  private async findValidInvite(code: string) {
    const normalized = String(code || '').trim();
    if (!normalized) throw new BadRequestException('邀请码不能为空');

    const invite = await this.prisma.teamInvite.findUnique({
      where: { code: normalized },
      include: {
        team: { select: { id: true, name: true, displayName: true, isPersonal: true, status: true } },
      },
    });
    if (!invite) throw new NotFoundException('邀请码不存在');
    if (invite.status !== 'pending') throw new BadRequestException('邀请码已失效');
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      await this.prisma.teamInvite.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('邀请码已过期');
    }
    if (invite.team.isPersonal) throw new BadRequestException('无效的企业邀请');
    if (invite.team.status !== 'active') throw new BadRequestException('企业已停用');
    return invite;
  }
}
