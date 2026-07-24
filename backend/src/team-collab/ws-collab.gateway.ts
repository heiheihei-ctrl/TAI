import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'http';
import type { Duplex } from 'stream';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CollabEventBus,
  channelForProject,
  channelForTeam,
  channelForUser,
} from './collab-event-bus.service';
import { CollabEventLog } from './collab-event-log.service';
import { CollabEnvelope, CommentMarkerMovePayload, CursorPayload, PresenceUserPayload } from './types';

const WS_PATH = '/ws/collab';
const HEARTBEAT_MS = 25_000;

const FORWARD_TYPES: ReadonlySet<string> = new Set([
  'team_credits_changed',
  'user_credits_changed',
  'cursor',
  'task_status',
  'presence_join',
  'presence_leave',
  'node_patch',
  'canvas_patch',
  'node_lock',
  'toast',
  'snapshot_required',
  'access_revoked',
  'comment_changed',
  'team_projects_changed',
  'comment_marker_move',
]);

interface WsConn {
  ws: WebSocket;
  connId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  teamId: string;
  projectId: string | null;
  unsubs: Array<() => void>;
  isAlive: boolean;
}

interface UpgradeCtx {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  teamId: string;
  projectId: string | null;
  afterSeq: number;
}

@Injectable()
export class WsCollabGateway implements OnModuleDestroy {
  private readonly logger = new Logger(WsCollabGateway.name);
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly conns = new Set<WsConn>();
  private readonly projectConns = new Map<string, Set<WsConn>>();
  private readonly connIndex = new Map<string, WsConn>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private originAllowed: ((origin: string) => boolean) | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly bus: CollabEventBus,
    private readonly log: CollabEventLog,
  ) {
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  hasConn(connId: string): boolean {
    return this.connIndex.has(connId);
  }

  getConnUserId(connId: string): string | undefined {
    return this.connIndex.get(connId)?.userId;
  }

  setOriginCheck(fn: (origin: string) => boolean): void {
    this.originAllowed = fn;
  }

  attach(server: HttpServer): void {
    server.on('upgrade', (req, socket, head) => {
      void this.handleUpgrade(req, socket as Duplex, head as Buffer).catch((err) => {
        this.logger.error(`ws upgrade failed: ${err instanceof Error ? err.message : String(err)}`);
        try {
          this.reject(socket as Duplex, 500, 'Internal Server Error');
        } catch {}
      });
    });
  }

  private reject(socket: Duplex, code: number, msg: string): void {
    try {
      socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\n\r\n`);
    } catch {}
    try {
      socket.destroy();
    } catch {}
  }

  /** 与旧 Socket.IO 对齐：query / Bearer / cookie 均可鉴权。 */
  private extractToken(req: IncomingMessage, url: URL): string {
    const fromQuery = url.searchParams.get('token');
    if (typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim();

    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    const cookie = req.headers.cookie;
    if (typeof cookie === 'string') {
      const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
      if (match?.[1]) {
        try {
          return decodeURIComponent(match[1]);
        } catch {
          return match[1];
        }
      }
    }
    return '';
  }

  private async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    let url: URL;
    try {
      url = new URL(req.url ?? '', 'http://localhost');
    } catch {
      return this.reject(socket, 400, 'Bad Request');
    }
    if (url.pathname !== WS_PATH) return;

    const origin = req.headers.origin ?? '';
    if (this.originAllowed && origin && !this.originAllowed(origin)) {
      return this.reject(socket, 403, 'Forbidden Origin');
    }

    const token = this.extractToken(req, url);
    const teamId = url.searchParams.get('teamId') ?? '';
    const projectId = url.searchParams.get('projectId');
    const afterSeq = Number.parseInt(url.searchParams.get('after') ?? '0', 10) || 0;

    let userId = '';
    let tokenName = '';
    let role = '';
    try {
      const payload = await this.jwt.verifyAsync<any>(token);
      userId = String(payload?.sub ?? '');
      tokenName = String(payload?.name ?? payload?.username ?? '').trim();
      role = String(payload?.role ?? '');
    } catch {
      return this.reject(socket, 401, 'Unauthorized');
    }
    if (!userId) return this.reject(socket, 401, 'Unauthorized');

    const profile = await this.resolveUserProfile(userId, tokenName);

    const isSuperAdmin =
      role.toLowerCase() === 'admin' ? await this.isUserSuperAdmin(userId) : false;

    if (teamId && !isSuperAdmin) {
      const member = await this.prisma.teamMembership
        .findUnique({ where: { teamId_userId: { teamId, userId } } })
        .catch(() => null);
      if (!member) return this.reject(socket, 403, 'Forbidden');
    }
    if (projectId) {
      if (isSuperAdmin) {
        const exists = await this.prisma.project
          .findUnique({ where: { id: projectId }, select: { id: true } })
          .catch(() => null);
        if (!exists) return this.reject(socket, 404, 'Not Found');
      } else {
        const ok = await this.assertProjectAccess(projectId, userId, teamId).catch(() => false);
        if (!ok) return this.reject(socket, 403, 'Forbidden');
      }
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      void this.register(ws, { userId, userName: profile.name, avatarUrl: profile.avatarUrl, teamId, projectId, afterSeq });
    });
  }

  private async resolveUserProfile(userId: string, tokenName: string): Promise<{ name: string; avatarUrl: string | null }> {
    const user = await this.prisma.user
      .findUnique({ where: { id: userId }, select: { name: true, avatarUrl: true } })
      .catch(() => null);
    const dbName = typeof user?.name === 'string' ? user.name.trim() : '';
    return { name: dbName || tokenName || userId.slice(0, 8), avatarUrl: user?.avatarUrl ?? null };
  }

  private async isUserSuperAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user
      .findUnique({ where: { id: userId }, select: { role: true } })
      .catch(() => null);
    return typeof user?.role === 'string' && user.role.toLowerCase() === 'admin';
  }

  private async assertProjectAccess(
    projectId: string,
    userId: string,
    teamId: string,
  ): Promise<boolean> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return false;
    if (project.userId === userId) return true;
    if (!teamId) return false;
    // TAI 团队项目写在 project.teamId；兼容旧的 teamProjectShare 行。
    if (project.teamId === teamId) {
      const member = await this.prisma.teamMembership.findUnique({
        where: { teamId_userId: { teamId, userId } },
      });
      if (member) return true;
    }
    const share = await this.prisma.teamProjectShare.findUnique({
      where: { projectId_teamId: { projectId, teamId } },
    });
    if (!share) return false;
    const member = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    return Boolean(member);
  }

  private async register(ws: WebSocket, ctx: UpgradeCtx): Promise<void> {
    const conn: WsConn = {
      ws,
      connId: randomUUID(),
      userId: ctx.userId,
      userName: ctx.userName,
      avatarUrl: ctx.avatarUrl,
      teamId: ctx.teamId,
      projectId: ctx.projectId,
      unsubs: [],
      isAlive: true,
    };
    this.conns.add(conn);
    this.connIndex.set(conn.connId, conn);

    const forward = (env: CollabEnvelope) => {
      if (!FORWARD_TYPES.has(env.type)) return;
      if (env.senderConnId && env.senderConnId === conn.connId) return;
      if (env.type === 'cursor' && env.senderUserId === conn.userId) return;
      this.safeSend(conn, env);
    };

    if (conn.userId) {
      conn.unsubs.push(await this.bus.subscribeTo(channelForUser(conn.userId), forward));
    }
    if (conn.teamId) {
      conn.unsubs.push(await this.bus.subscribeTo(channelForTeam(conn.teamId), forward));
    }
    if (conn.projectId) {
      conn.unsubs.push(await this.bus.subscribeTo(channelForProject(conn.projectId), forward));
      let set = this.projectConns.get(conn.projectId);
      if (!set) {
        set = new Set();
        this.projectConns.set(conn.projectId, set);
      }
      set.add(conn);
      await this.bus.publishTo(channelForProject(conn.projectId), {
        type: 'presence_join',
        payload: { userId: conn.userId, name: conn.userName, avatarUrl: conn.avatarUrl },
        ts: Date.now(),
        senderUserId: conn.userId,
        senderConnId: conn.connId,
      } as CollabEnvelope<PresenceUserPayload>);
    }

    this.safeSend(conn, {
      type: 'connected' as any,
      payload: {
        connId: conn.connId,
        presence: this.getPresence(conn.projectId),
        degraded: this.bus.isDegraded(),
      },
      ts: Date.now(),
    } as CollabEnvelope);

    if (ctx.projectId && ctx.afterSeq > 0) {
      try {
        const { envelopes, truncated } = await this.log.readAfter(ctx.projectId, ctx.afterSeq, 200);
        if (truncated) {
          this.safeSend(conn, {
            type: 'snapshot_required' as any,
            payload: { after: ctx.afterSeq },
            ts: Date.now(),
          } as CollabEnvelope);
        }
        for (const env of envelopes) {
          this.safeSend(conn, env);
        }
      } catch {}
    }

    ws.on('pong', () => {
      conn.isAlive = true;
    });
    ws.on('message', (raw) => this.onClientMessage(conn, raw));
    ws.on('close', () => this.cleanup(conn));
    ws.on('error', () => this.cleanup(conn));
  }

  private onClientMessage(conn: WsConn, raw: RawData): void {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg?.type === 'cursor' && conn.projectId) {
      const p = msg.payload ?? {};
      if (typeof p.x !== 'number' || typeof p.y !== 'number') return;
      void this.bus.publishTo(channelForProject(conn.projectId), {
        type: 'cursor',
        payload: {
          userId: conn.userId,
          name: conn.userName,
          avatarUrl: conn.avatarUrl,
          x: p.x,
          y: p.y,
          viewport: p.viewport,
        },
        ts: Date.now(),
        senderUserId: conn.userId,
        senderConnId: conn.connId,
      } as CollabEnvelope<CursorPayload>);
      return;
    }
    if (msg?.type === 'comment_marker_move' && conn.projectId) {
      const p = msg.payload ?? {};
      if (typeof p.threadId !== 'string' || !p.threadId) return;
      if (typeof p.x !== 'number' || typeof p.y !== 'number') return;
      void this.bus.publishTo(channelForProject(conn.projectId), {
        type: 'comment_marker_move',
        payload: {
          threadId: p.threadId,
          x: p.x,
          y: p.y,
        },
        ts: Date.now(),
        senderUserId: conn.userId,
        senderConnId: conn.connId,
      } as CollabEnvelope<CommentMarkerMovePayload>);
    }
  }

  private getPresence(projectId: string | null): PresenceUserPayload[] {
    if (!projectId) return [];
    const set = this.projectConns.get(projectId);
    if (!set) return [];
    const seen = new Map<string, PresenceUserPayload>();
    for (const c of set) {
      if (!seen.has(c.userId)) seen.set(c.userId, { userId: c.userId, name: c.userName, avatarUrl: c.avatarUrl });
    }
    return [...seen.values()];
  }

  private safeSend(conn: WsConn, env: CollabEnvelope): void {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    try {
      conn.ws.send(JSON.stringify(env));
    } catch {}
  }

  private cleanup(conn: WsConn): void {
    if (!this.conns.has(conn)) return;
    this.conns.delete(conn);
    this.connIndex.delete(conn.connId);
    for (const u of conn.unsubs) {
      try {
        u();
      } catch {}
    }
    conn.unsubs = [];
    if (conn.projectId) {
      const set = this.projectConns.get(conn.projectId);
      if (set) {
        set.delete(conn);
        const stillThere = [...set].some((c) => c.userId === conn.userId);
        if (set.size === 0) this.projectConns.delete(conn.projectId);
        if (!stillThere) {
          void this.bus.publishTo(channelForProject(conn.projectId), {
            type: 'presence_leave',
            payload: { userId: conn.userId, name: conn.userName, avatarUrl: conn.avatarUrl },
            ts: Date.now(),
            senderUserId: conn.userId,
            senderConnId: conn.connId,
          } as CollabEnvelope<PresenceUserPayload>);
        }
      }
    }
    try {
      conn.ws.terminate();
    } catch {}
  }

  private heartbeat(): void {
    for (const conn of [...this.conns]) {
      if (!conn.isAlive) {
        this.cleanup(conn);
        continue;
      }
      conn.isAlive = false;
      try {
        conn.ws.ping();
      } catch {
        this.cleanup(conn);
      }
    }
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    for (const conn of [...this.conns]) this.cleanup(conn);
    try {
      this.wss.close();
    } catch {}
  }
}