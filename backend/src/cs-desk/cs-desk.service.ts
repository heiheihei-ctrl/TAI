import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getDeploymentBrand } from '../config/deployment-brand';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CsCollabStatus,
  CsConversationStatus,
  CsMessageType,
  CsSenderRole,
} from './cs-desk.types';

type MessageContent = Record<string, unknown>;

@Injectable()
export class CsDeskService implements OnModuleInit {
  private broadcast:
    | ((conversationId: string, event: Record<string, unknown>) => void)
    | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.ensureSeeds();
  }

  setBroadcaster(
    fn: (conversationId: string, event: Record<string, unknown>) => void,
  ) {
    this.broadcast = fn;
  }

  assertLinglongEnabled() {
    if (getDeploymentBrand() !== 'linglong') {
      throw new ForbiddenException('客服工作台仅在玲珑部署可用');
    }
  }

  /** 可打开客服工作台：管理员或已开启客服身份 */
  canAccessWorkbench(user: {
    role?: string | null;
    isCsAgent?: boolean | null;
    status?: string | null;
  }): boolean {
    if (user.status && user.status !== 'active') return false;
    const role = String(user.role || '').toLowerCase();
    if (role === 'admin' || role === 'normal_admin') return true;
    return Boolean(user.isCsAgent);
  }

  /** 可接待/自动分单/计为在线客服：必须显式开启 isCsAgent */
  isDispatchableAgent(user: {
    isCsAgent?: boolean | null;
    status?: string | null;
  }): boolean {
    if (user.status && user.status !== 'active') return false;
    return Boolean(user.isCsAgent);
  }

  /** @deprecated 兼容旧调用：工作台访问权 */
  isAgentCapable(user: {
    role?: string | null;
    isCsAgent?: boolean | null;
    status?: string | null;
  }): boolean {
    return this.canAccessWorkbench(user);
  }

  async assertAgentUser(userId: string) {
    this.assertLinglongEnabled();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isCsAgent: true, status: true, name: true },
    });
    if (!user || !this.canAccessWorkbench(user)) {
      throw new ForbiddenException('仅客服/管理员可访问');
    }
    return user;
  }

  async assertDispatchableAgent(userId: string) {
    const user = await this.assertAgentUser(userId);
    if (!this.isDispatchableAgent(user)) {
      throw new ForbiddenException('当前账号未开启客服身份，不能接待/上线');
    }
    return user;
  }

  private async ensureSeeds() {
    try {
      const [qrCount, pkgCount] = await Promise.all([
        this.prisma.csQuickReply.count(),
        this.prisma.csServicePackage.count(),
      ]);
      if (qrCount === 0) {
        await this.prisma.csQuickReply.createMany({
          data: [
            {
              title: '欢迎语',
              body: '您好，我是玲珑客服，很高兴为您服务，请问有什么可以帮您？',
              sortOrder: 0,
            },
            {
              title: '模板库指引',
              body: '您可以在画布左侧打开模板库，选择场景模板后一键生成效果图。如需我远程协助，可点击「发起协同」。',
              sortOrder: 1,
            },
            {
              title: '服务包说明',
              body: '基础服务包包含专属图库与人工服务窗口，详情我可以发给您服务包卡片。',
              sortOrder: 2,
            },
          ],
        });
      }
      if (pkgCount === 0) {
        await this.prisma.csServicePackage.createMany({
          data: [
            {
              name: '基础服务包',
              priceCents: 29900,
              description: '含专属供应链图库、模板库与人工服务窗口',
              tag: '推荐',
              sortOrder: 0,
            },
            {
              name: '专业服务包',
              priceCents: 99900,
              description: '含 IADU 协同操作额度与优先响应',
              tag: '进阶',
              sortOrder: 1,
            },
          ],
        });
      }
    } catch {
      // tables may not exist yet during first boot before migrate
    }
  }

  private emit(conversationId: string, event: Record<string, unknown>) {
    try {
      this.broadcast?.(conversationId, event);
    } catch {
      // ignore
    }
  }

  private mapMessage(row: {
    id: string;
    conversationId: string;
    senderRole: string;
    senderId: string | null;
    type: string;
    content: Prisma.JsonValue;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderRole: row.senderRole as CsSenderRole,
      senderId: row.senderId,
      type: row.type as CsMessageType,
      content: (row.content ?? {}) as MessageContent,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapConversation(row: any) {
    return {
      id: row.id,
      userId: row.userId,
      agentId: row.agentId,
      status: row.status as CsConversationStatus,
      lastMessageAt: row.lastMessageAt?.toISOString?.() ?? row.lastMessageAt,
      unreadUser: row.unreadUser,
      unreadAgent: row.unreadAgent,
      endedAt: row.endedAt?.toISOString?.() ?? row.endedAt ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
      user: row.user
        ? {
            id: row.user.id,
            name: row.user.name,
            phone: row.user.phone,
            avatarUrl: row.user.avatarUrl,
            profileCompany: row.user.profileCompany,
            profileRealName: row.user.profileRealName,
            profileEmail: row.user.profileEmail,
            email: row.user.email,
          }
        : undefined,
      agent: row.agent
        ? {
            id: row.agent.id,
            name: row.agent.name,
            avatarUrl: row.agent.avatarUrl,
          }
        : null,
      lastMessage: row.messages?.[0]
        ? this.mapMessage(row.messages[0])
        : undefined,
    };
  }

  async getOrCreateOpenConversation(userId: string, initialMessage?: string) {
    this.assertLinglongEnabled();
    const existing = await this.prisma.csConversation.findFirst({
      where: {
        userId,
        status: { in: ['waiting', 'active'] },
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        user: true,
        agent: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (existing) {
      if (initialMessage?.trim()) {
        await this.postMessage({
          conversationId: existing.id,
          senderRole: 'user',
          senderId: userId,
          type: 'text',
          content: { text: initialMessage.trim() },
        });
      }
      return this.getConversationForUser(existing.id, userId);
    }

    const created = await this.prisma.csConversation.create({
      data: {
        userId,
        status: 'waiting',
      },
    });

    await this.postMessage({
      conversationId: created.id,
      senderRole: 'system',
      senderId: null,
      type: 'system',
      content: { text: '已进入排队，客服接入后将为您服务' },
    });

    if (initialMessage?.trim()) {
      await this.postMessage({
        conversationId: created.id,
        senderRole: 'user',
        senderId: userId,
        type: 'text',
        content: { text: initialMessage.trim() },
      });
    }

    await this.tryAutoAssign(created.id);
    return this.getConversationForUser(created.id, userId);
  }

  /**
   * 在线客服中选负载最低者原子接入；无人在线则保持 waiting。
   */
  async tryAutoAssign(conversationId: string): Promise<boolean> {
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true, status: true, agentId: true },
    });
    if (!conv || conv.status !== 'waiting' || conv.agentId) return false;

    const online = await this.prisma.csAgentPresence.findMany({
      where: { status: 'online' },
      select: { userId: true },
    });
    if (online.length === 0) return false;

    // 仅 isCsAgent 参与自动分单；禁止把会话分给咨询用户本人
    const candidates = await this.prisma.user.findMany({
      where: {
        id: {
          in: online.map((o) => o.userId).filter((id) => id !== conv.userId),
        },
        status: 'active',
        isCsAgent: true,
      },
      select: {
        id: true,
        name: true,
        csAgentLastAssignedAt: true,
      },
    });
    if (candidates.length === 0) return false;

    const loads = await Promise.all(
      candidates.map(async (c) => {
        const activeCount = await this.prisma.csConversation.count({
          where: { agentId: c.id, status: 'active' },
        });
        return { ...c, activeCount };
      }),
    );

    loads.sort((a, b) => {
      if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;
      const at = a.csAgentLastAssignedAt?.getTime() ?? 0;
      const bt = b.csAgentLastAssignedAt?.getTime() ?? 0;
      return at - bt;
    });

    const pick = loads[0];
    if (!pick) return false;

    const claimed = await this.prisma.csConversation.updateMany({
      where: {
        id: conversationId,
        status: 'waiting',
        agentId: null,
      },
      data: {
        status: 'active',
        agentId: pick.id,
      },
    });
    if (claimed.count === 0) return false;

    await this.prisma.user.update({
      where: { id: pick.id },
      data: { csAgentLastAssignedAt: new Date() },
    });

    const agentName = pick.name || '客服';
    await this.postMessage({
      conversationId,
      senderRole: 'system',
      senderId: null,
      type: 'system',
      content: { text: `客服 ${agentName} 已接入` },
    });
    this.emit(conversationId, {
      type: 'status',
      conversationId,
      status: 'active',
      agentId: pick.id,
    });
    return true;
  }

  async listMine(userId: string) {
    this.assertLinglongEnabled();
    const rows = await this.prisma.csConversation.findMany({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
      include: {
        user: true,
        agent: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return rows.map((r) => this.mapConversation(r));
  }

  async listAdmin(options: {
    status?: string;
    scope?: 'mine' | 'all';
    agentId: string;
    isFullAdmin?: boolean;
  }) {
    this.assertLinglongEnabled();
    const status = options.status;
    const scope = options.scope || 'mine';
    const where: Prisma.CsConversationWhereInput = {};
    if (status && status !== 'all') {
      where.status = status as CsConversationStatus;
    }
    // waiting 始终公共池；active/ended 默认只看自己的（admin 可看全部）
    if (status === 'active' || status === 'ended') {
      if (scope !== 'all' || !options.isFullAdmin) {
        where.agentId = options.agentId;
      }
    }

    const rows = await this.prisma.csConversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
      include: {
        user: true,
        agent: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const [waiting, myActive, ended] = await Promise.all([
      this.prisma.csConversation.count({ where: { status: 'waiting' } }),
      this.prisma.csConversation.count({
        where: { status: 'active', agentId: options.agentId },
      }),
      this.prisma.csConversation.count({
        where:
          options.isFullAdmin && scope === 'all'
            ? { status: 'ended' }
            : { status: 'ended', agentId: options.agentId },
      }),
    ]);

    const onlinePresence = await this.prisma.csAgentPresence.findMany({
      where: { status: 'online' },
      select: { userId: true },
    });
    const onlineAgentCount =
      onlinePresence.length === 0
        ? 0
        : await this.prisma.user.count({
            where: {
              id: { in: onlinePresence.map((p) => p.userId) },
              status: 'active',
              isCsAgent: true,
            },
          });

    return {
      items: rows.map((r) => this.mapConversation(r)),
      counts: { waiting, active: myActive, ended },
      onlineAgentCount,
      myActiveCount: myActive,
    };
  }

  async getConversationForUser(id: string, userId: string) {
    this.assertLinglongEnabled();
    const row = await this.prisma.csConversation.findUnique({
      where: { id },
      include: {
        user: true,
        agent: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!row || row.userId !== userId) {
      throw new NotFoundException('会话不存在');
    }
    return this.mapConversation(row);
  }

  async getConversationForAgent(id: string) {
    this.assertLinglongEnabled();
    const row = await this.prisma.csConversation.findUnique({
      where: { id },
      include: {
        user: true,
        agent: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!row) throw new NotFoundException('会话不存在');
    return this.mapConversation(row);
  }

  async listMessages(conversationId: string, actor: { userId: string; isAgent: boolean }) {
    this.assertLinglongEnabled();
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    if (!actor.isAgent && conv.userId !== actor.userId) {
      throw new ForbiddenException('无权查看该会话');
    }
    const rows = await this.prisma.csMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return rows.map((r) => this.mapMessage(r));
  }

  async postMessage(params: {
    conversationId: string;
    senderRole: CsSenderRole;
    senderId: string | null;
    type: CsMessageType;
    content: MessageContent;
  }) {
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: params.conversationId },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    if (conv.status === 'ended' && params.senderRole !== 'system') {
      throw new BadRequestException('会话已结束');
    }

    const message = await this.prisma.csMessage.create({
      data: {
        conversationId: params.conversationId,
        senderRole: params.senderRole,
        senderId: params.senderId,
        type: params.type,
        content: params.content as Prisma.InputJsonValue,
      },
    });

    const unreadPatch =
      params.senderRole === 'user'
        ? { unreadAgent: { increment: 1 } }
        : params.senderRole === 'agent'
          ? { unreadUser: { increment: 1 } }
          : {};

    await this.prisma.csConversation.update({
      where: { id: params.conversationId },
      data: {
        lastMessageAt: message.createdAt,
        ...unreadPatch,
      },
    });

    const mapped = this.mapMessage(message);
    this.emit(params.conversationId, {
      type: 'message',
      conversationId: params.conversationId,
      message: mapped,
    });
    return mapped;
  }

  async sendUserMessage(
    conversationId: string,
    userId: string,
    body: {
      type?: 'text' | 'attachment';
      text?: string;
      url?: string;
      fileName?: string;
      mimeType?: string;
    },
  ) {
    this.assertLinglongEnabled();
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv || conv.userId !== userId) {
      throw new NotFoundException('会话不存在');
    }
    const type = body.type === 'attachment' ? 'attachment' : 'text';
    if (type === 'text') {
      const text = String(body.text || '').trim();
      if (!text) throw new BadRequestException('消息不能为空');
      return this.postMessage({
        conversationId,
        senderRole: 'user',
        senderId: userId,
        type: 'text',
        content: { text },
      });
    }
    const url = String(body.url || '').trim();
    if (!url) throw new BadRequestException('附件地址不能为空');
    return this.postMessage({
      conversationId,
      senderRole: 'user',
      senderId: userId,
      type: 'attachment',
      content: {
        url,
        fileName: body.fileName || null,
        mimeType: body.mimeType || null,
      },
    });
  }

  async sendAgentMessage(
    conversationId: string,
    agentId: string,
    body: {
      type?: 'text' | 'attachment';
      text?: string;
      url?: string;
      fileName?: string;
      mimeType?: string;
    },
  ) {
    this.assertLinglongEnabled();
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    if (conv.status === 'waiting') {
      throw new BadRequestException('请先接入会话');
    }
    if (conv.agentId && conv.agentId !== agentId) {
      throw new ForbiddenException('该会话已由其他客服接待');
    }
    const type = body.type === 'attachment' ? 'attachment' : 'text';
    if (type === 'text') {
      const text = String(body.text || '').trim();
      if (!text) throw new BadRequestException('消息不能为空');
      return this.postMessage({
        conversationId,
        senderRole: 'agent',
        senderId: agentId,
        type: 'text',
        content: { text },
      });
    }
    const url = String(body.url || '').trim();
    if (!url) throw new BadRequestException('附件地址不能为空');
    return this.postMessage({
      conversationId,
      senderRole: 'agent',
      senderId: agentId,
      type: 'attachment',
      content: {
        url,
        fileName: body.fileName || null,
        mimeType: body.mimeType || null,
      },
    });
  }

  async acceptConversation(conversationId: string, agentId: string) {
    this.assertLinglongEnabled();
    await this.assertDispatchableAgent(agentId);
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
      include: { agent: true },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    if (conv.userId === agentId) {
      throw new BadRequestException('不能接待自己发起的咨询');
    }
    if (conv.status === 'ended') {
      throw new BadRequestException('会话已结束');
    }
    if (conv.status === 'active' && conv.agentId && conv.agentId !== agentId) {
      throw new ForbiddenException('该会话已由其他客服接待');
    }

    if (conv.status === 'waiting') {
      const claimed = await this.prisma.csConversation.updateMany({
        where: {
          id: conversationId,
          status: 'waiting',
          agentId: null,
        },
        data: {
          status: 'active',
          agentId,
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException('该会话已被其他客服接入');
      }
    } else {
      await this.prisma.csConversation.update({
        where: { id: conversationId },
        data: { status: 'active', agentId },
      });
    }

    await this.prisma.user.update({
      where: { id: agentId },
      data: { csAgentLastAssignedAt: new Date() },
    });

    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { name: true },
    });
    const agentName = agent?.name || '客服';
    await this.postMessage({
      conversationId,
      senderRole: 'system',
      senderId: null,
      type: 'system',
      content: { text: `客服 ${agentName} 已接入` },
    });

    this.emit(conversationId, {
      type: 'status',
      conversationId,
      status: 'active',
      agentId,
    });

    return this.getConversationForAgent(conversationId);
  }

  async transferConversation(
    conversationId: string,
    fromAgentId: string,
    toAgentId: string,
    isFullAdmin: boolean,
  ) {
    this.assertLinglongEnabled();
    if (fromAgentId === toAgentId) {
      throw new BadRequestException('不能转接给自己');
    }
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    if (conv.status !== 'active') {
      throw new BadRequestException('仅进行中的会话可转接');
    }
    if (!isFullAdmin && conv.agentId !== fromAgentId) {
      throw new ForbiddenException('无权转接该会话');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: toAgentId },
      select: {
        id: true,
        name: true,
        role: true,
        isCsAgent: true,
        status: true,
      },
    });
    if (!target || !this.isDispatchableAgent(target)) {
      throw new BadRequestException('目标不是有效客服（需开启客服身份）');
    }
    if (target.id === conv.userId) {
      throw new BadRequestException('不能转接给咨询用户本人');
    }
    const presence = await this.prisma.csAgentPresence.findUnique({
      where: { userId: toAgentId },
    });
    if (!presence || presence.status !== 'online') {
      throw new BadRequestException('目标客服不在线');
    }

    await this.prisma.csConversation.update({
      where: { id: conversationId },
      data: { agentId: toAgentId },
    });
    await this.prisma.user.update({
      where: { id: toAgentId },
      data: { csAgentLastAssignedAt: new Date() },
    });

    const targetName = target.name || '客服';
    await this.postMessage({
      conversationId,
      senderRole: 'system',
      senderId: null,
      type: 'system',
      content: { text: `会话已转接至 ${targetName}` },
    });
    this.emit(conversationId, {
      type: 'status',
      conversationId,
      status: 'active',
      agentId: toAgentId,
    });
    return this.getConversationForAgent(conversationId);
  }

  async setPresence(
    userId: string,
    status: 'online' | 'away' | 'offline',
  ) {
    this.assertLinglongEnabled();
    // 仅显式客服身份可上线参与分单；管理员未开客服身份时直接忽略
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isCsAgent: true, status: true, role: true },
    });
    if (!user || user.status !== 'active' || !this.isDispatchableAgent(user)) {
      if (status === 'offline') {
        await this.prisma.csAgentPresence
          .updateMany({ where: { userId }, data: { status: 'offline' } })
          .catch(() => undefined);
      }
      return { userId, status: 'offline' as const };
    }
    return this.prisma.csAgentPresence.upsert({
      where: { userId },
      create: { userId, status },
      update: { status },
    });
  }

  async getPresence(userId: string) {
    this.assertLinglongEnabled();
    const row = await this.prisma.csAgentPresence.findUnique({
      where: { userId },
    });
    return { status: (row?.status as 'online' | 'away' | 'offline') || 'offline' };
  }

  async listOnlineAgents(excludeUserId?: string) {
    this.assertLinglongEnabled();
    const online = await this.prisma.csAgentPresence.findMany({
      where: { status: 'online' },
      select: { userId: true },
    });
    const ids = online
      .map((o) => o.userId)
      .filter((id) => id !== excludeUserId);
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        status: 'active',
        isCsAgent: true,
      },
      select: { id: true, name: true, phone: true },
    });
    const withLoad = await Promise.all(
      users.map(async (u) => ({
        ...u,
        activeCount: await this.prisma.csConversation.count({
          where: { agentId: u.id, status: 'active' },
        }),
      })),
    );
    return withLoad.sort((a, b) => a.activeCount - b.activeCount);
  }

  async endConversation(
    conversationId: string,
    agentId: string,
    opts?: { force?: boolean },
  ) {
    this.assertLinglongEnabled();
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    if (!opts?.force && conv.agentId && conv.agentId !== agentId) {
      throw new ForbiddenException('无权结束该会话');
    }

    await this.prisma.csConversation.update({
      where: { id: conversationId },
      data: {
        status: 'ended',
        endedAt: new Date(),
        agentId: conv.agentId || agentId,
      },
    });

    await this.postMessage({
      conversationId,
      senderRole: 'system',
      senderId: null,
      type: 'system',
      content: { text: '会话已结束' },
    });

    this.emit(conversationId, {
      type: 'status',
      conversationId,
      status: 'ended',
      agentId: conv.agentId || agentId,
    });

    return this.getConversationForAgent(conversationId);
  }

  async markRead(
    conversationId: string,
    actor: { userId: string; isAgent: boolean },
  ) {
    this.assertLinglongEnabled();
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    if (!actor.isAgent && conv.userId !== actor.userId) {
      throw new ForbiddenException('无权操作');
    }

    await this.prisma.csConversation.update({
      where: { id: conversationId },
      data: actor.isAgent ? { unreadAgent: 0 } : { unreadUser: 0 },
    });

    const by = actor.isAgent ? 'agent' : 'user';
    this.emit(conversationId, { type: 'read', conversationId, by });
    return { ok: true };
  }

  async getCustomerProfile(userId: string) {
    this.assertLinglongEnabled();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { creditAccount: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    const membership = await this.prisma.userMembershipSubscription.findFirst({
      where: { userId, status: 'active' },
      orderBy: { currentPeriodEndAt: 'desc' },
    });

    let planName: string | null = null;
    if (membership?.membershipPlanId) {
      const plan = await this.prisma.membershipPlan.findUnique({
        where: { id: membership.membershipPlanId },
      });
      planName = plan?.name || plan?.code || null;
    }

    return {
      id: user.id,
      name: user.name,
      profileRealName: user.profileRealName,
      phone: user.phone,
      email: user.email || user.profileEmail,
      profileCompany: user.profileCompany,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
      creditBalance: user.creditAccount?.balance ?? 0,
      membershipPlanName: planName,
      membershipExpiresAt: membership?.currentPeriodEndAt?.toISOString() ?? null,
    };
  }

  async listServiceHistory(userId: string) {
    this.assertLinglongEnabled();
    const rows = await this.prisma.csConversation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        agent: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      agentName: r.agent?.name ?? null,
      preview: (r.messages[0]?.content as any)?.text ?? null,
    }));
  }

  async recommendPackage(conversationId: string, agentId: string, packageId: string) {
    this.assertLinglongEnabled();
    const pkg = await this.prisma.csServicePackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg || !pkg.enabled) throw new NotFoundException('服务包不存在');

    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    if (conv.status !== 'active') {
      throw new BadRequestException('仅进行中的会话可推荐服务包');
    }

    return this.postMessage({
      conversationId,
      senderRole: 'agent',
      senderId: agentId,
      type: 'service_package',
      content: {
        packageId: pkg.id,
        name: pkg.name,
        priceCents: pkg.priceCents,
        description: pkg.description,
        tag: pkg.tag,
      },
    });
  }

  async createTicket(
    conversationId: string,
    agentId: string,
    title: string,
    note?: string,
  ) {
    this.assertLinglongEnabled();
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('会话不存在');

    const ticket = await this.prisma.csTicket.create({
      data: {
        conversationId,
        userId: conv.userId,
        agentId,
        title: title.trim(),
        note: note?.trim() || null,
        status: 'open',
      },
    });

    await this.postMessage({
      conversationId,
      senderRole: 'system',
      senderId: null,
      type: 'system',
      content: { text: `已创建工单：${ticket.title}` },
    });

    return ticket;
  }

  async listTickets(conversationId: string) {
    this.assertLinglongEnabled();
    return this.prisma.csTicket.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCollabRequest(
    conversationId: string,
    agentId: string,
    opts?: { projectId?: string; pricePerMinute?: number },
  ) {
    this.assertLinglongEnabled();
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    if (conv.status !== 'active') {
      throw new BadRequestException('仅进行中的会话可发起协同');
    }

    const pricePerMinute = Number.isFinite(opts?.pricePerMinute)
      ? Math.max(1, Math.round(opts!.pricePerMinute!))
      : 50;

    const collab = await this.prisma.csCollabRequest.create({
      data: {
        conversationId,
        agentId,
        projectId: opts?.projectId || null,
        pricePerMinute,
        status: 'pending',
      },
    });

    await this.postMessage({
      conversationId,
      senderRole: 'agent',
      senderId: agentId,
      type: 'collab_request',
      content: {
        collabId: collab.id,
        pricePerMinute: collab.pricePerMinute,
        projectId: collab.projectId,
        status: collab.status,
        text: `客服发起了协同操作请求（${collab.pricePerMinute} 元/次/分钟）`,
      },
    });

    return collab;
  }

  async respondCollab(
    collabId: string,
    userId: string,
    action: 'accepted' | 'rejected',
    projectId?: string,
  ) {
    this.assertLinglongEnabled();
    const collab = await this.prisma.csCollabRequest.findUnique({
      where: { id: collabId },
      include: { conversation: true },
    });
    if (!collab) throw new NotFoundException('协同请求不存在');
    if (collab.conversation.userId !== userId) {
      throw new ForbiddenException('无权操作');
    }
    if (collab.status !== 'pending') {
      throw new BadRequestException('该协同请求已处理');
    }

    const nextStatus = action as CsCollabStatus;
    const updated = await this.prisma.csCollabRequest.update({
      where: { id: collabId },
      data: {
        status: nextStatus,
        projectId: projectId || collab.projectId,
        startedAt: action === 'accepted' ? new Date() : null,
      },
    });

    let systemText =
      action === 'accepted' ? '用户已同意协同操作请求' : '用户已拒绝协同操作请求';
    if (action === 'accepted' && !updated.projectId) {
      systemText += '（未绑定项目，请先打开项目后再继续协同）';
    } else if (action === 'accepted' && updated.projectId) {
      systemText += `（项目 ${updated.projectId}）`;
    }

    await this.postMessage({
      conversationId: collab.conversationId,
      senderRole: 'system',
      senderId: null,
      type: 'system',
      content: {
        text: systemText,
        collabId: updated.id,
        status: updated.status,
        projectId: updated.projectId,
      },
    });

    return updated;
  }

  async listQuickReplies() {
    this.assertLinglongEnabled();
    return this.prisma.csQuickReply.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async listServicePackages() {
    this.assertLinglongEnabled();
    return this.prisma.csServicePackage.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async assertCanAccessConversation(
    conversationId: string,
    userId: string,
    isAgent: boolean,
  ) {
    const conv = await this.prisma.csConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('会话不存在');
    if (isAgent) return conv;
    if (conv.userId !== userId) throw new ForbiddenException('无权加入会话');
    return conv;
  }
}
