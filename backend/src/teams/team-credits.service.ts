import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from './teams.service';
import { PaymentService } from '../payment/payment.service';
import {
  PaymentMethod,
  TEAM_TEST_PAY_AMOUNT,
  type PaymentOrderResponse,
} from '../payment/dto/payment.dto';
import {
  CreateTeamCreditsTopupOrderDto,
  CreateTeamSeatPackageOrderDto,
} from './dto/team-payment.dto';

const TEAM_SEAT_PLANS = {
  monthly: { pricePerSeat: 100, creditsPerSeat: 10000, days: 30 },
  annual: { pricePerSeat: 1200, creditsPerSeat: 120000, days: 365 },
} as const;

const CREDITS_PER_YUAN = 100;

@Injectable()
export class TeamCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teams: TeamsService,
    private readonly paymentService: PaymentService,
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

    const paidSeatOrders = await this.prisma.paymentOrder.findMany({
      where: {
        status: 'paid',
        orderType: 'team_seat_package',
      },
      orderBy: { paidAt: 'desc' },
      take: 50,
    });

    const activePackages = paidSeatOrders
      .map((order) => {
        const meta =
          order.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
            ? (order.metadata as Record<string, unknown>)
            : null;
        if (!meta || meta.teamId !== teamId) return null;
        const seats = Number(meta.seats);
        const cycle = typeof meta.cycle === 'string' ? meta.cycle : 'monthly';
        const expiresAt =
          typeof meta.expiresAt === 'string' ? meta.expiresAt : order.paidAt?.toISOString();
        if (!Number.isFinite(seats) || seats <= 0 || !expiresAt) return null;
        return {
          id: order.id,
          seats,
          cycle,
          credits: order.credits,
          expiresAt,
          purchasedAt: (order.paidAt ?? order.createdAt).toISOString(),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      seats: number;
      cycle: string;
      credits: number;
      expiresAt: string;
      purchasedAt: string;
    }>;

    return {
      permanentSeats: 0,
      totalSeats: team.maxSeats,
      usedSeats: team.members.length,
      activePackages,
    };
  }

  async createSeatPackageOrder(
    teamId: string,
    userId: string,
    dto: CreateTeamSeatPackageOrderDto,
  ) {
    await this.teams.assertTeamManager(teamId, userId);

    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.status !== 'active' || team.isPersonal) {
      throw new BadRequestException('无法为该团队购买席位套餐');
    }

    const plan = TEAM_SEAT_PLANS[dto.cycle];
    const listAmount = plan.pricePerSeat * dto.seats;
    const credits = plan.creditsPerSeat * dto.seats;
    const expiresAt = new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000);

    const order = await this.paymentService.createOrder(
      userId,
      {
        amount: TEAM_TEST_PAY_AMOUNT,
        credits,
        paymentMethod: dto.paymentMethod as PaymentMethod,
        orderType: 'team_seat_package',
        metadata: {
          teamId,
          seats: dto.seats,
          cycle: dto.cycle,
          listAmount,
          expiresAt: expiresAt.toISOString(),
        },
      },
      null,
    );

    return this.toTeamPaymentOrder(order);
  }

  async createTopupOrder(
    teamId: string,
    userId: string,
    dto: CreateTeamCreditsTopupOrderDto,
  ) {
    await this.teams.assertTeamManager(teamId, userId);

    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.status !== 'active' || team.isPersonal) {
      throw new BadRequestException('无法为该团队充值积分');
    }

    const listAmount = dto.amount;
    const credits = Math.round(listAmount * CREDITS_PER_YUAN);
    if (credits <= 0) {
      throw new BadRequestException('充值金额无效');
    }

    const order = await this.paymentService.createOrder(
      userId,
      {
        amount: TEAM_TEST_PAY_AMOUNT,
        credits,
        paymentMethod: dto.paymentMethod as PaymentMethod,
        orderType: 'team_credits_topup',
        metadata: {
          teamId,
          listAmount,
        },
      },
      null,
    );

    return this.toTeamPaymentOrder(order);
  }

  private toTeamPaymentOrder(order: PaymentOrderResponse) {
    if (!order.qrCodeUrl) {
      throw new BadRequestException('支付二维码生成失败，请稍后重试');
    }
    return {
      orderNo: order.orderNo,
      qrCodeUrl: order.qrCodeUrl,
      amount: order.amount,
      credits: order.credits,
    };
  }
}
