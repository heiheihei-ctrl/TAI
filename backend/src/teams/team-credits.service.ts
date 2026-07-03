import {
  BadRequestException,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from './teams.service';

@Injectable()
export class TeamCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teams: TeamsService,
  ) {}

  async getAccount(teamId: string, userId: string) {
    await this.teams.assertTeamMember(teamId, userId);
    const account = await this.prisma.teamCreditAccount.findUnique({
      where: { teamId },
    });
    return {
      balance: account?.balance ?? 0,
      reserved: account?.reserved ?? 0,
    };
  }

  async getLedger(teamId: string, userId: string, take: number, skip: number) {
    await this.teams.assertTeamMember(teamId, userId);
    const account = await this.prisma.teamCreditAccount.findUnique({
      where: { teamId },
    });
    if (!account) return [];

    const rows = await this.prisma.teamCreditLedger.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 100),
      skip: Math.max(skip, 0),
    });

    return rows.map((row) => ({
      id: row.id,
      entryType: row.entryType,
      amount: row.amount,
      taskId: row.taskId ?? undefined,
      taskKind: row.taskKind ?? undefined,
      actorUserId: row.actorUserId ?? undefined,
      note: row.note ?? undefined,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listSeatPackages(teamId: string, userId: string) {
    await this.teams.assertTeamMember(teamId, userId);
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: { select: { id: true } } },
    });
    if (!team) throw new BadRequestException('团队不存在');

    return {
      permanentSeats: 0,
      totalSeats: team.maxSeats,
      usedSeats: team.members.length,
      activePackages: [] as Array<{
        id: string;
        seats: number;
        cycle: string;
        credits: number;
        expiresAt: string;
        purchasedAt: string;
      }>,
    };
  }

  createSeatPackageOrder() {
    throw new NotImplementedException('团队席位套餐购买即将上线');
  }

  createTopupOrder() {
    throw new NotImplementedException('团队积分充值即将上线');
  }
}
