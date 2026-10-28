import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import type { VisualAgentSession, VisualAgentTurn, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OssService } from '../../oss/oss.service';
import { CreditsService } from '../../credits/credits.service';
import { ApiResponseStatus } from '../../credits/dto/credits.dto';
import { TeamCoreService } from '../../team-core/team-core.service';
import { ArkRequestError, VisualAgentClient } from './visual-agent.client';
import { buildAgentPayload, summarizeEvent, turnOutcome, validateReferenceUrls, type ArkEvent, type VisualArtifact, type VisualEvent } from './visual-agent.protocol';

const ACTIVE = ['queued', 'running', 'collecting', 'settling', 'uncertain'];
type TurnWithSession = VisualAgentTurn & { session: VisualAgentSession };
type SaveTurn = (data: Prisma.VisualAgentTurnUpdateManyMutationInput, expectedSubmission?: string) => Promise<void>;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

@Injectable()
export class VisualAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VisualAgentService.name);
  private readonly running = new Set<string>();
  private recoveryTimer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly client: VisualAgentClient,
    private readonly oss: OssService,
    private readonly credits: CreditsService,
    private readonly teams: TeamCoreService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('VISUAL_AGENT_ENABLED') !== 'true') return;
    this.recoveryTimer = setInterval(() => { void this.recover().catch(() => this.logger.warn('视觉创作恢复扫描失败，请检查迁移和数据库')); }, 30000);
    this.recoveryTimer.unref();
    void this.recover().catch(() => this.logger.warn('视觉创作表尚不可用，请执行数据库迁移'));
  }

  onModuleDestroy() { this.stopped = true; clearInterval(this.recoveryTimer); }

  availability(includeDetails = false) {
    const missing: string[] = [];
    if (this.config.get<string>('VISUAL_AGENT_ENABLED') !== 'true') missing.push('VISUAL_AGENT_ENABLED=true');
    if (!this.config.get<string>('ARK_API_KEY')) missing.push('ARK_API_KEY');
    if (!this.config.get<string>('VISUAL_AGENT_ID')) {
      for (const key of ['VISUAL_AGENT_MODEL_ID', 'VISUAL_AGENT_IMAGE_MODEL_ID', 'VISUAL_AGENT_VIDEO_MODEL_ID']) {
        if (!this.config.get<string>(key)) missing.push(key);
      }
    }
    const price = Number(this.config.get<string>('VISUAL_AGENT_CREDITS_PER_TURN'));
    if (!Number.isSafeInteger(price) || price <= 0) missing.push('VISUAL_AGENT_CREDITS_PER_TURN（正整数）');
    if (!this.oss.isEnabled()) missing.push('产物存储');
    return { available: missing.length === 0, reason: missing.length ? (includeDetails ? `尚未配置：${missing.join('、')}` : '视觉创作尚未开通，请联系管理员配置服务和积分价格。') : null, creditsPerTurn: price > 0 ? price : null };
  }

  private assertAvailable() {
    const state = this.availability();
    if (!state.available) throw new ServiceUnavailableException(state.reason!);
  }

  private async assertProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { userId: true, teamId: true } });
    if (!project) throw new NotFoundException('项目不存在');
    if (project.teamId) await this.teams.assertMember(project.teamId, userId);
    else if (project.userId !== userId) throw new NotFoundException('项目不存在');
    return project;
  }

  async owned(userId: string, id: string) {
    const session = await this.prisma.visualAgentSession.findFirst({ where: { id, userId } });
    if (!session) throw new NotFoundException('创作会话不存在');
    await this.assertProject(userId, session.projectId);
    return session;
  }

  async list(userId: string, projectId: string) {
    await this.assertProject(userId, projectId);
    return this.prisma.visualAgentSession.findMany({ where: { userId, projectId }, orderBy: { updatedAt: 'desc' }, take: 50,
      select: { id: true, title: true, projectId: true, activeTurnId: true, updatedAt: true } });
  }

  async create(userId: string, projectId: string, title = '视觉创作') {
    this.assertAvailable();
    await this.assertProject(userId, projectId);
    let agentId = this.config.get<string>('VISUAL_AGENT_ID') || '';
    let environmentId = this.config.get<string>('VISUAL_AGENT_ENVIRONMENT_ID') || '';
    const ownsAgent = !agentId;
    const ownsEnvironment = !environmentId;
    let upstreamId = '';
    try {
      if (!agentId) agentId = (await this.client.request('POST', '/agents', buildAgentPayload(
        this.config.get<string>('VISUAL_AGENT_MODEL_ID')!, this.config.get<string>('VISUAL_AGENT_IMAGE_MODEL_ID')!, this.config.get<string>('VISUAL_AGENT_VIDEO_MODEL_ID')!,
      ))).id;
      if (!agentId) throw new Error('方舟未返回 Agent ID');
      if (!environmentId) environmentId = (await this.client.request('POST', '/environments', {
        name: `tanva-visual-${randomUUID()}`, config: { type: 'cloud', networking: { type: 'unrestricted' } },
      })).id;
      if (!environmentId) throw new Error('方舟未返回 Environment ID');
      upstreamId = (await this.client.request('POST', '/sessions', { agent: agentId, environment_id: environmentId, title: title.slice(0, 120) })).id;
      if (!upstreamId) throw new Error('方舟未返回 Session ID');
      const session = await this.prisma.visualAgentSession.create({ data: {
        userId, projectId, title: title.slice(0, 120), agentId, environmentId, upstreamId, ownsAgent, ownsEnvironment,
      } });
      return { id: session.id, title: session.title, projectId: session.projectId, turns: [], activeTurnId: null };
    } catch (error) {
      await this.cleanup({ upstreamId, agentId, environmentId, ownsAgent, ownsEnvironment });
      throw error;
    }
  }

  async get(userId: string, id: string) {
    const session = await this.owned(userId, id);
    if (session.activeTurnId) this.start(session.activeTurnId);
    const turns = await this.prisma.visualAgentTurn.findMany({ where: { sessionId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { id, title: session.title, projectId: session.projectId, activeTurnId: session.activeTurnId, closing: session.closing,
      turns: turns.reverse().map(turn => this.publicTurn(turn)) };
  }

  private publicTurn(turn: VisualAgentTurn) {
    return { id: turn.id, requestId: turn.requestId, prompt: turn.prompt, referenceUrls: turn.referenceUrls,
      status: turn.status, events: turn.events, artifacts: turn.artifacts, error: turn.error, createdAt: turn.createdAt };
  }

  async sendMessage(userId: string, id: string, input: { prompt: string; requestId: string; referenceUrls?: string[] }) {
    this.assertAvailable();
    const prompt = input.prompt?.trim();
    if (!prompt || prompt.length > 12000 || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.requestId || '')) throw new BadRequestException('需求或请求标识无效');
    let refs: string[];
    try { refs = validateReferenceUrls(input.referenceUrls); } catch (error: any) { throw new BadRequestException(error.message); }
    const session = await this.owned(userId, id);
    if (session.closing) throw new ConflictException('该会话正在关闭，请新建会话');
    const existing = await this.prisma.visualAgentTurn.findUnique({ where: { sessionId_requestId: { sessionId: id, requestId: input.requestId } } });
    if (existing) {
      if (existing.prompt !== prompt || JSON.stringify(existing.referenceUrls) !== JSON.stringify(refs)) throw new ConflictException('同一请求标识不能用于不同需求');
      return this.publicTurn(existing);
    }
    if (session.activeTurnId) throw new ConflictException('该会话正在执行，请等待或停止当前任务');
    const turnId = randomUUID();
    const turn = await this.prisma.$transaction(async tx => {
      const claim = await tx.visualAgentSession.updateMany({ where: { id, userId, activeTurnId: null, closing: false }, data: { activeTurnId: turnId } });
      if (!claim.count) throw new ConflictException('该会话正在执行');
      return tx.visualAgentTurn.create({ data: { id: turnId, sessionId: id, requestId: input.requestId, prompt, referenceUrls: refs } });
    });
    this.start(turn.id);
    return this.publicTurn(turn);
  }

  async interrupt(userId: string, id: string) {
    const session = await this.owned(userId, id);
    if (!session.activeTurnId) return { accepted: true };
    // Persist intent first. The worker cancels pending submission or interrupts after its POST is accepted.
    await this.prisma.visualAgentTurn.updateMany({ where: { id: session.activeTurnId, outcome: null }, data: { cancelRequested: true } });
    this.start(session.activeTurnId);
    return { accepted: true };
  }

  async syncArtifacts(userId: string, id: string) {
    const session = await this.owned(userId, id);
    if (session.closing) throw new ConflictException('该会话正在关闭');
    await this.prisma.visualAgentTurn.updateMany({ where: { sessionId: id, status: 'completed', leaseOwner: null }, data: {
      artifactSyncUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), leaseUntil: null,
    } });
    await this.recover();
    return { accepted: true };
  }

  async remove(userId: string, id: string) {
    const session = await this.owned(userId, id);
    if (session.activeTurnId) throw new ConflictException('请先停止当前任务，待任务结束后关闭会话');
    const claim = await this.prisma.visualAgentSession.updateMany({ where: { id, userId, activeTurnId: null }, data: { closing: true } });
    if (!claim.count) throw new ConflictException('会话已有任务开始执行，请先停止任务');
    await this.cleanup(session, true);
    await this.prisma.visualAgentSession.deleteMany({ where: { id, userId, closing: true, activeTurnId: null } });
    return { deleted: true };
  }

  private async cleanup(session: { upstreamId: string; agentId: string; environmentId: string; ownsAgent: boolean; ownsEnvironment: boolean }, strict = false) {
    for (const path of [session.upstreamId && `/sessions/${session.upstreamId}`, session.ownsAgent && session.agentId && `/agents/${session.agentId}`, session.ownsEnvironment && session.environmentId && `/environments/${session.environmentId}`]) {
      if (!path) continue;
      try { await this.client.request('DELETE', path); } catch (error) { if (strict) throw error; }
    }
  }

  private start(id: string) {
    if (this.running.has(id) || this.stopped) return;
    this.running.add(id);
    void this.execute(id).catch(() => this.logger.warn(`视觉创作任务 ${id} 暂停，等待恢复`)).finally(() => this.running.delete(id));
  }

  private async recover() {
    const turns = await this.prisma.visualAgentTurn.findMany({ where: {
      AND: [
        { OR: [{ status: { in: ACTIVE } }, { status: 'completed', artifactSyncUntil: { gt: new Date() } }] },
        { OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
      ],
    }, orderBy: { updatedAt: 'asc' }, take: 10 });
    for (const turn of turns) this.start(turn.id);
  }

  private async execute(id: string) {
    const leaseToken = randomUUID();
    const claimed = await this.prisma.visualAgentTurn.updateMany({ where: { id, session: { closing: false },
      AND: [
        { OR: [{ status: { in: ACTIVE } }, { status: 'completed', artifactSyncUntil: { gt: new Date() } }] },
        { OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
      ],
    }, data: { leaseOwner: leaseToken, leaseUntil: new Date(Date.now() + 90000) } });
    if (!claimed.count) return;
    let turn = await this.prisma.visualAgentTurn.findUniqueOrThrow({ where: { id }, include: { session: true } });
    const session = turn.session;
    let stream: Awaited<ReturnType<VisualAgentClient['openStream']>> | undefined;
    let leaseLost = false;
    const lease = setInterval(() => {
      void this.prisma.visualAgentTurn.updateMany({ where: { id, leaseOwner: leaseToken, leaseUntil: { gt: new Date() } }, data: { leaseUntil: new Date(Date.now() + 90000) } })
        .then(result => { if (!result.count) leaseLost = true; }).catch(() => { leaseLost = true; });
    }, 20000);
    const save: SaveTurn = async (data, expectedSubmission) => {
      if (leaseLost || this.stopped) throw new Error('worker lease lost');
      const result = await this.prisma.visualAgentTurn.updateMany({
        where: { id, leaseOwner: leaseToken, leaseUntil: { gt: new Date() }, ...(expectedSubmission ? { submission: expectedSubmission, cancelRequested: false } : {}) }, data,
      });
      if (!result.count) { leaseLost = true; throw new Error('worker lease lost'); }
      turn = await this.prisma.visualAgentTurn.findUniqueOrThrow({ where: { id }, include: { session: true } });
    };
    try {
      if (turn.cancelRequested && turn.submission === 'pending') {
        await this.finish(turn, 'interrupted', '已在提交前停止任务', leaseToken);
        return;
      }
      if (turn.status === 'completed') {
        // The cloud may register extra outputs after the first collection window. Correlate by turn filename prefix.
        const known = turn.artifacts as unknown as VisualArtifact[];
        const fresh = await this.collectArtifacts(session, known, turn.id);
        if (fresh.length) await save({ artifacts: json([...known, ...fresh]), error: null });
        return;
      }
      if (turn.status === 'settling' || (turn.outcome && turn.outcome !== 'completed')) {
        await this.finish(turn, turn.outcome === 'interrupted' ? 'interrupted' : turn.outcome === 'completed' ? 'completed' : 'failed', turn.error, leaseToken);
        return;
      }
      if (!turn.apiUsageId) {
        const project = await this.assertProject(session.userId, session.projectId);
        const prior = await this.prisma.apiUsageRecord.findFirst({ where: { userId: session.userId, serviceType: 'ark-visual-agent', requestParams: { path: ['visualAgentTurnId'], equals: id } } });
        const usage = prior ? { apiUsageId: prior.id } : await this.credits.preDeductCredits({ userId: session.userId, teamId: project.teamId || undefined,
          serviceType: 'ark-visual-agent', model: 'managed-visual-agent', idempotencyKey: id, idempotencyWindowMs: 120000,
          requestParams: { visualAgentTurnId: id, projectId: session.projectId, billingModeName: '视觉创作 Agent', aiProvider: 'volcengine', billingTeamId: project.teamId || undefined },
        });
        if (!usage.apiUsageId) throw new Error('积分预扣失败');
        await save({ apiUsageId: usage.apiUsageId });
      }
      if (turn.status === 'collecting' || turn.outcome === 'completed') {
        await this.credits.updateApiUsageStatus(turn.apiUsageId!, ApiResponseStatus.SUCCESS);
        await this.collectTurn(turn, save, leaseToken);
        return;
      }
      const queue: ArkEvent[] = [];
      stream = await this.client.openStream(session.upstreamId, event => {
        queue.push(event);
        if (queue.length > 1000) queue.shift(); // Durable history fills any dropped preview events.
      });
      await stream.ready;
      if (turn.submission === 'pending') {
        const baseline = await this.client.history(session.upstreamId);
        const cursor = baseline[baseline.length - 1]?.id;
        await save({ cursor, submission: 'sending', status: 'running' }, 'pending');
        try {
          await this.client.request('POST', `/sessions/${session.upstreamId}/events`, { events: [{ type: 'user.message', content: [
            { type: 'text', text: turn.prompt }, ...turn.referenceUrls.map(url => ({ type: 'image', source: { type: 'url', url } })),
          ] }, { type: 'system.message', content: [{ type: 'text', text:
            `本轮交付文件必须保存到 /mnt/session/outputs/，文件名必须以 tanva-${turn.id}__ 开头，例如 tanva-${turn.id}__poster.png。此命名要求覆盖以前轮次的命名要求。需要交付已有素材时，请复制为这个前缀的新文件。图片与视频均须遵守，以便网站准确归档本轮产物。`,
          }] }] });
          await save({ submission: 'sent' });
        } catch (error) {
          if (error instanceof ArkRequestError && error.requestRejected) {
            await save({ outcome: 'failed', status: 'settling', error: error.message });
            await this.finish(turn, 'failed', error.message, leaseToken);
            return;
          }
          // An HTTP timeout may still mean the paid task was accepted. Never resend it automatically.
          await save({ status: 'uncertain', error: '任务提交结果待确认，正在核对云端记录；请勿重复发送。' });
        }
      }
      const seen = new Set<string>();
      let outcome: ReturnType<typeof turnOutcome> = turn.outcome as ReturnType<typeof turnOutcome>;
      const events = (turn.events as unknown as VisualEvent[]) || [];
      const accept = async (event: ArkEvent) => {
        if (event.id && seen.has(event.id)) return;
        if (event.id) seen.add(event.id);
        // Only persisted history advances the recovery cursor; stream/history can arrive out of order.
        if (event.type === 'user.message' || event.type === 'user.interrupt' || event.type === 'session.status_running' || event.type.startsWith('agent.')) turn.seenRunning = true;
        const result = turnOutcome(event, turn.seenRunning);
        if (result) outcome = result;
        if (!event.id || event.type.startsWith('event_')) return;
        if (!events.some(e => e.id === event.id)) events.push(summarizeEvent(event));
      };
      const deadline = turn.createdAt.getTime() + 45 * 60 * 1000;
      let interruptionSent = false;
      while (!outcome && !this.stopped && !leaseLost) {
        const history = await this.client.history(session.upstreamId, turn.cursor || undefined);
        for (const event of history) await accept(event);
        const cursor = history[history.length - 1]?.id || turn.cursor;
        // Discard stream frames already covered by history. Remaining frames provide live progress.
        for (const event of queue.splice(0)) {
          if (event.type.startsWith('agent.') && event.id && !seen.has(event.id)) await accept(event);
        }
        await save({ cursor, outcome, seenRunning: turn.seenRunning, events: json(events.slice(-500)),
          ...(turn.seenRunning ? { submission: 'sent', error: null } : {}),
          status: outcome === 'completed' ? 'collecting' : outcome ? 'settling' : turn.seenRunning ? 'running' : turn.status,
        });
        if (!outcome && turn.cancelRequested && !interruptionSent) {
          await this.client.request('POST', `/sessions/${session.upstreamId}/events`, { events: [{ type: 'user.interrupt' }] });
          interruptionSent = true;
        }
        // Even expired turns must reconcile persisted events before requesting interruption.
        if (!outcome && Date.now() >= deadline) break;
        if (!outcome) await wait(2000);
      }
      if (!outcome) {
        if (this.stopped || leaseLost) return;
        // Keep the active lock until cloud interruption is observed, instead of allowing a second paid task.
        await this.client.request('POST', `/sessions/${session.upstreamId}/events`, { events: [{ type: 'user.interrupt' }] });
        await save({ status: 'uncertain', error: '任务超过等待时间，已请求云端停止。请刷新状态或再次点击停止。' });
        return;
      }
      stream.close();
      const completed = outcome === 'completed';
      if (!completed) {
        await this.finish(turn, outcome === 'interrupted' ? 'interrupted' : 'failed', outcome === 'requires_action' ? '云端需要工具确认。请检查 Agent 权限配置后新建会话。' : '云端任务已停止或执行失败', leaseToken);
        return;
      }
      await save({ status: 'collecting', error: null });
      // Settle cloud execution before file-copy retries; storage failure must not trigger another generation.
      await this.credits.updateApiUsageStatus(turn.apiUsageId!, ApiResponseStatus.SUCCESS);
      await this.collectTurn(turn, save, leaseToken);
    } catch (error: any) {
      if (this.stopped || leaseLost) return;
      if (turn.status === 'completed') await save({ error: '补充产物转存暂时失败，后台将继续同步。' });
      else if (turn.submission === 'pending') await this.finish(turn, 'failed', error?.message || '创作任务启动失败', leaseToken);
      else await save({ status: turn.outcome === 'completed' ? 'collecting' : turn.outcome ? 'settling' : 'uncertain', error: '云端连接或产物转存暂时失败，后台将继续恢复；无需重新生成。' });
    } finally {
      clearInterval(lease);
      stream?.close();
      await this.prisma.visualAgentTurn.updateMany({ where: { id, leaseOwner: leaseToken }, data: { leaseOwner: null, leaseUntil: new Date(Date.now() + (turn.status === 'completed' ? 60000 : 30000)) } });
    }
  }

  private async finish(turn: TurnWithSession, status: string, error: string | null, leaseToken: string) {
    const fence = { id: turn.id, leaseOwner: leaseToken, leaseUntil: { gt: new Date() } };
    const staged = await this.prisma.visualAgentTurn.updateMany({ where: fence, data: { status: 'settling', outcome: status, error } });
    if (!staged.count) throw new Error('worker lease lost');
    // Persist settlement direction first. Both billing methods are idempotent across a crash/takeover.
    if (turn.apiUsageId) {
      if (status === 'completed') await this.credits.updateApiUsageStatus(turn.apiUsageId, ApiResponseStatus.SUCCESS);
      else {
        await this.credits.updateApiUsageStatus(turn.apiUsageId, ApiResponseStatus.FAILED, error || undefined);
        await this.credits.refundCredits(turn.session.userId, turn.apiUsageId);
      }
    }
    await this.prisma.$transaction(async tx => {
      const result = await tx.visualAgentTurn.updateMany({ where: { ...fence, leaseUntil: { gt: new Date() } }, data: {
        status, error, ...(status === 'completed' ? { artifactSyncUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) } : {}),
      } });
      if (!result.count) throw new Error('worker lease lost');
      await tx.visualAgentSession.updateMany({ where: { id: turn.sessionId, activeTurnId: turn.id }, data: { activeTurnId: null } });
    });
  }

  private async collectTurn(turn: TurnWithSession, save: SaveTurn, leaseToken: string) {
    const artifacts = (turn.artifacts as unknown as VisualArtifact[]) || [];
    // Registration is asynchronous. A text-only answer can finish with no media; failed copies remain retryable.
    const usedTools = (turn.events as unknown as VisualEvent[]).filter(event => event.type === 'agent.tool_use').map(event => event.name);
    let stableSince = Date.now();
    for (let attempt = 0; attempt < 60; attempt++) {
      const fresh = await this.collectArtifacts(turn.session, artifacts, turn.id);
      artifacts.push(...fresh);
      if (fresh.length) { stableSince = Date.now(); await save({ artifacts: json(artifacts) }); }
      const expectedImage = !usedTools.includes('image_generate') || artifacts.some(a => a.mimeType.startsWith('image/'));
      const expectedVideo = !usedTools.some(name => name === 'video_generate' || name === 'compose_video') || artifacts.some(a => a.mimeType.startsWith('video/'));
      if (expectedImage && expectedVideo && Date.now() - stableSince >= 10000) break;
      if (this.stopped) return;
      await wait(2000);
    }
    if ((usedTools.includes('image_generate') && !artifacts.some(a => a.mimeType.startsWith('image/'))) ||
      (usedTools.some(name => name === 'video_generate' || name === 'compose_video') && !artifacts.some(a => a.mimeType.startsWith('video/')))) {
      await this.finish(turn, 'completed', '部分产物尚未注册，后台会继续同步；无需重新生成。', leaseToken);
      return;
    }
    await this.finish(turn, 'completed', null, leaseToken);
  }

  async collectArtifacts(session: VisualAgentSession, known: VisualArtifact[], turnId?: string): Promise<VisualArtifact[]> {
    const result: VisualArtifact[] = [];
    for (const file of await this.client.files(session.upstreamId)) {
      const filename = file.filename?.split(/[\\/]/).pop() || '';
      if (turnId && !filename.startsWith(`tanva-${turnId}__`)) continue;
      if (known.some(asset => asset.id === file.id) || (file.status && file.status !== 'active') || !/^(image\/(png|jpeg|webp|gif)|video\/mp4)$/.test(file.mime_type) || !file.download_url) continue;
      const extension = file.mime_type === 'video/mp4' ? 'mp4' : file.mime_type.split('/')[1];
      const key = `projects/${session.projectId}/visual-agent/${session.id}/${file.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.${extension}`;
      const source = await this.client.download(file.download_url);
      let bytes = 0;
      const limiter = new Transform({ transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > 512 * 1024 * 1024 ? new Error('产物超过 512MB') : null, chunk);
      } });
      source.on('error', error => limiter.destroy(error));
      limiter.on('error', () => source.destroy());
      source.pipe(limiter);
      try {
        const stored = await this.oss.putStream(key, limiter, { headers: { 'Content-Type': file.mime_type } });
        if (!stored.url || /^(data:|blob:)/i.test(stored.url)) throw new Error('产物转存失败');
        result.push({ id: file.id, filename: (turnId ? filename.slice(`tanva-${turnId}__`.length) : filename).slice(0, 240), mimeType: file.mime_type, key: stored.key, url: stored.url });
      } finally { source.destroy(); limiter.destroy(); }
    }
    return result;
  }
}
