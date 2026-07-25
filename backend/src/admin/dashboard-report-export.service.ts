import { Injectable, BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

export type DashboardReportType = 'daily' | 'weekly' | 'monthly';

type PeriodBucket = {
  key: string;
  label: string;
  start: Date;
  endExclusive: Date;
};

type PeriodRow = {
  label: string;
  startDate: string;
  endDate: string;
  totalUsers: number;
  dailyActiveUsers: number;
  newUserDailyActiveUsers: number;
  oldUserDailyActiveUsers: number;
  nextDayRetentionRate: number | null;
  coreModelUsageCount: number;
  /** 当天有新增用户的渠道中文，顿号拼接；无新增时为「未填写」 */
  sourceChannelText: string;
  paidUserCount?: number;
  paidConversionRate?: number | null;
};

const CHANNEL_ORDER = [
  '小红书',
  '抖音',
  '视频号',
  'B站',
  '公众号',
  '朋友推荐',
  'AI搜索',
  '其他渠道',
  '未填写',
] as const;

@Injectable()
export class DashboardReportExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
  ) {}

  async exportExcel(options: {
    reportType: DashboardReportType;
    startDate?: string;
    endDate?: string;
  }): Promise<{ filename: string; buffer: Buffer }> {
    const now = new Date();
    const dayStarts = this.resolveExportDayStarts(
      now,
      options.reportType,
      options.startDate,
      options.endDate,
    );

    if (!dayStarts.length) {
      throw new BadRequestException('导出日期范围无效');
    }

    // 一律按天一行：日报=当天，周报=一周内每天，月报=一个月内每天
    const periods = dayStarts.map((dayStart) => {
      const endExclusive = new Date(dayStart);
      endExclusive.setDate(endExclusive.getDate() + 1);
      const key = this.formatDateInput(dayStart);
      return { key, label: key, start: dayStart, endExclusive } satisfies PeriodBucket;
    });

    const rows: PeriodRow[] = [];
    for (const period of periods) {
      rows.push(await this.buildPeriodRow(period, options.reportType, now));
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Tanva Admin';
    workbook.created = now;
    const sheet = workbook.addWorksheet(this.reportTypeLabel(options.reportType));

    const baseHeaders = [
      '日期',
      '总用户存量',
      '日活跃用户数',
      '新用户日活跃数',
      '老用户日活跃数',
      '次日留存率(%)',
      '核心模型使用次数',
      '渠道来源',
    ];
    const paidHeaders =
      options.reportType === 'daily' ? [] : ['付费用户数', '付费转化率(%)'];
    sheet.addRow([...baseHeaders, ...paidHeaders]);

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    for (const row of rows) {
      const values: Array<string | number> = [
        row.label,
        row.totalUsers,
        row.dailyActiveUsers,
        row.newUserDailyActiveUsers,
        row.oldUserDailyActiveUsers,
        row.nextDayRetentionRate == null ? '-' : row.nextDayRetentionRate,
        row.coreModelUsageCount,
        row.sourceChannelText,
      ];
      if (options.reportType !== 'daily') {
        values.push(row.paidUserCount ?? 0);
        values.push(row.paidConversionRate == null ? '-' : row.paidConversionRate);
      }
      sheet.addRow(values);
    }

    sheet.columns.forEach((col) => {
      col.width = 16;
    });
    sheet.getColumn(1).width = 14;
    sheet.getColumn(8).width = 36;

    const rangeStart = this.formatDateInput(dayStarts[0]);
    const rangeEnd = this.formatDateInput(dayStarts[dayStarts.length - 1]);
    const filename = `系统概览_${this.reportTypeLabel(options.reportType)}_${rangeStart}_${rangeEnd}.xlsx`;
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return { filename, buffer: Buffer.from(arrayBuffer) };
  }

  /**
   * 日报：锚点当天（1 行）
   * 周报：锚点所在自然周周一~周日（按天展开）
   * 月报：锚点所在自然月 1 号~月末（按天展开）
   * 锚点优先 endDate，其次 startDate，否则今天。
   */
  private resolveExportDayStarts(
    now: Date,
    reportType: DashboardReportType,
    startDate?: string,
    endDate?: string,
  ): Date[] {
    const anchorInput = endDate || startDate;
    const parsedAnchor = anchorInput
      ? this.parseDateInput(anchorInput)
      : this.startOfDay(now);
    if (!parsedAnchor) {
      throw new BadRequestException('日期格式无效，请使用 YYYY-MM-DD');
    }
    const today = this.startOfDay(now);
    // 不导出未来日期
    const anchor = parsedAnchor > today ? today : parsedAnchor;

    if (reportType === 'daily') {
      return [anchor];
    }

    if (reportType === 'weekly') {
      const monday = this.startOfIsoWeek(anchor);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      const rangeEnd = sunday > today ? today : sunday;
      return this.buildDayStarts(monday, rangeEnd);
    }

    // monthly
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    monthEnd.setHours(0, 0, 0, 0);
    const rangeEnd = monthEnd > today ? today : monthEnd;
    return this.buildDayStarts(monthStart, rangeEnd);
  }

  private parseDateInput(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    if (
      date.getFullYear() !== y ||
      date.getMonth() !== m - 1 ||
      date.getDate() !== d
    ) {
      return null;
    }
    return date;
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** ISO 周：周一为一周开始 */
  private startOfIsoWeek(date: Date): Date {
    const d = this.startOfDay(date);
    const day = d.getDay(); // 0=Sun ... 6=Sat
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  private buildDayStarts(start: Date, end: Date): Date[] {
    const days: Date[] = [];
    for (
      let cursor = this.startOfDay(start);
      cursor <= end;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      days.push(new Date(cursor));
    }
    return days;
  }

  private reportTypeLabel(type: DashboardReportType): string {
    if (type === 'weekly') return '周报';
    if (type === 'monthly') return '月报';
    return '日报';
  }

  private formatDateInput(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatChannelText(channelCounts: Record<string, number>): string {
    const labels = CHANNEL_ORDER.filter((channel) => (channelCounts[channel] ?? 0) > 0);
    if (!labels.length) return '未填写';
    // 若只有「未填写」也直接返回；有真实渠道时去掉「未填写」更可读
    const meaningful = labels.filter((c) => c !== '未填写');
    return (meaningful.length ? meaningful : labels).join('、');
  }

  private async buildPeriodRow(
    period: PeriodBucket,
    reportType: DashboardReportType,
    now: Date,
  ): Promise<PeriodRow> {
    const activity = await this.adminService.queryDayActivityBreakdown(
      period.start,
      period.endExclusive,
    );

    const [totalUsers, registeredUsers, coreModelUsageCount, channelRows] =
      await Promise.all([
        this.prisma.user.count({
          where: { createdAt: { lt: period.endExclusive } },
        }),
        this.prisma.user.count({
          where: {
            createdAt: { gte: period.start, lt: period.endExclusive },
          },
        }),
        this.prisma.apiUsageRecord.count({
          where: {
            createdAt: { gte: period.start, lt: period.endExclusive },
          },
        }),
        this.prisma.$queryRaw<Array<{ channel: string | null; count: bigint | number | string }>>`
          SELECT "sourceChannel" AS channel, COUNT(*)::bigint AS count
          FROM "User"
          WHERE "createdAt" >= ${period.start}
            AND "createdAt" < ${period.endExclusive}
          GROUP BY "sourceChannel"
        `,
      ]);

    const channelCounts: Record<string, number> = Object.fromEntries(
      CHANNEL_ORDER.map((c) => [c, 0]),
    );
    for (const row of channelRows) {
      const label = this.adminService.normalizeSourceChannelLabel(row.channel);
      channelCounts[label] = (channelCounts[label] ?? 0) + Number(row.count);
    }

    let nextDayRetentionRate: number | null = null;
    const nextDayEnd = new Date(period.start);
    nextDayEnd.setDate(nextDayEnd.getDate() + 2);
    if (nextDayEnd <= now) {
      const cohort = await this.adminService.queryNextDayRetentionCohort(period.start);
      nextDayRetentionRate =
        cohort.cohortSize > 0
          ? Math.round((cohort.returnedCount / cohort.cohortSize) * 1000) / 10
          : null;
    }

    let paidUserCount: number | undefined;
    let paidConversionRate: number | null | undefined;
    if (reportType !== 'daily') {
      const paidRows = await this.prisma.$queryRaw<
        Array<{ count: bigint | number | string }>
      >`
        SELECT COUNT(DISTINCT "userId")::bigint AS count
        FROM "PaymentOrder"
        WHERE status = 'paid'
          AND COALESCE("paidAt", "createdAt") >= ${period.start}
          AND COALESCE("paidAt", "createdAt") < ${period.endExclusive}
      `;
      paidUserCount = Number(paidRows[0]?.count ?? 0);
      paidConversionRate =
        registeredUsers > 0
          ? Math.round((paidUserCount / registeredUsers) * 1000) / 10
          : null;
    }

    const endInclusive = new Date(period.endExclusive);
    endInclusive.setDate(endInclusive.getDate() - 1);

    return {
      label: period.label,
      startDate: this.formatDateInput(period.start),
      endDate: this.formatDateInput(endInclusive),
      totalUsers,
      dailyActiveUsers: activity.dailyActiveUsers,
      newUserDailyActiveUsers: activity.newUserDailyActiveUsers,
      oldUserDailyActiveUsers: activity.oldUserDailyActiveUsers,
      nextDayRetentionRate,
      coreModelUsageCount,
      sourceChannelText: this.formatChannelText(channelCounts),
      paidUserCount,
      paidConversionRate,
    };
  }
}
