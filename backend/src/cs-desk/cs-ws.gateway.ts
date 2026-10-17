import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'http';
import type { Duplex } from 'stream';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { getDeploymentBrand } from '../config/deployment-brand';
import { CsDeskService } from './cs-desk.service';

const WS_PATH = '/ws/cs';
const HEARTBEAT_MS = 25_000;

interface CsWsConn {
  ws: WebSocket;
  connId: string;
  userId: string;
  role: string;
  isAgent: boolean;
  rooms: Set<string>;
  isAlive: boolean;
  canvasProjectId: string | null;
  canvasPresenceVersion: number;
}

@Injectable()
export class CsWsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CsWsGateway.name);
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly conns = new Set<CsWsConn>();
  private readonly rooms = new Map<string, Set<CsWsConn>>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private originAllowed: ((origin: string) => boolean) | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly csDesk: CsDeskService,
  ) {}

  onModuleInit() {
    this.csDesk.setCanvasOnlineChecker((userId, projectId) => [...this.conns].some(
      (conn) => conn.userId === userId && conn.canvasProjectId === projectId && conn.ws.readyState === WebSocket.OPEN,
    ));
    this.csDesk.setBroadcaster((conversationId, event) => {
      this.broadcast(conversationId, event);
    });
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  onModuleDestroy() {
    this.csDesk.setCanvasOnlineChecker(() => false);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const conn of this.conns) {
      try {
        conn.ws.close();
      } catch {
        // ignore
      }
    }
    this.conns.clear();
    this.rooms.clear();
  }

  setOriginCheck(fn: (origin: string) => boolean): void {
    this.originAllowed = fn;
  }

  attach(server: HttpServer): void {
    server.on('upgrade', (req, socket, head) => {
      void this.handleUpgrade(req, socket as Duplex, head as Buffer).catch((err) => {
        this.logger.error(
          `cs ws upgrade failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        try {
          this.reject(socket as Duplex, 500, 'Internal Server Error');
        } catch {
          // ignore
        }
      });
    });
  }

  private reject(socket: Duplex, code: number, msg: string): void {
    this.logger.warn(`客服实时连接握手被拒绝：${code} ${msg}`);
    try {
      socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\n\r\n`);
    } catch {
      // ignore
    }
    try {
      socket.destroy();
    } catch {
      // ignore
    }
  }

  private isUpgradeOriginAllowed(origin: string, hostHeader: string): boolean {
    if (!this.originAllowed) return true;
    if (this.originAllowed(origin)) return true;
    try {
      const originHost = new URL(origin).hostname.toLowerCase();
      const reqHost = String(hostHeader || '')
        .split(':')[0]
        .trim()
        .toLowerCase();
      if (originHost && reqHost && originHost === reqHost) return true;
    } catch {
      // ignore
    }
    return false;
  }

  private extractToken(req: IncomingMessage, url: URL): string {
    // Match HTTP JWT authentication: the current cookie wins over cached tokens.
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
    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }
    const fromQuery = url.searchParams.get('token');
    if (typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim();
    return '';
  }

  private async handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    let url: URL;
    try {
      url = new URL(req.url ?? '', 'http://localhost');
    } catch {
      return this.reject(socket, 400, 'Bad Request');
    }
    if (url.pathname !== WS_PATH) return;

    if (getDeploymentBrand() !== 'linglong') {
      return this.reject(socket, 403, 'Forbidden');
    }

    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const hostHeader = typeof req.headers.host === 'string' ? req.headers.host : '';
    if (origin && !this.isUpgradeOriginAllowed(origin, hostHeader)) {
      return this.reject(socket, 403, 'Forbidden Origin');
    }

    const token = this.extractToken(req, url);
    let userId = '';
    let role = '';
    try {
      const payload = await this.jwt.verifyAsync<any>(token);
      userId = String(payload?.sub ?? '');
      role = String(payload?.role ?? '').toLowerCase();
    } catch (error) {
      this.logger.warn(`客服实时连接令牌校验失败：${error instanceof Error ? error.name : '未知错误'}`);
      return this.reject(socket, 401, 'Unauthorized');
    }
    if (!userId) return this.reject(socket, 401, 'Unauthorized');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, isCsAgent: true },
    });
    if (!user || user.status !== 'active') {
      return this.reject(socket, 401, 'Unauthorized');
    }
    role = String(user.role || role || '').toLowerCase();
    // 仅显式 isCsAgent 才算可接待座席；用户侧连 WS 不会把自己标成在线客服
    const isAgent = this.csDesk.isDispatchableAgent(user);

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      const conn: CsWsConn = {
        ws,
        connId: randomUUID(),
        userId,
        role,
        isAgent,
        rooms: new Set(),
        isAlive: true,
        canvasProjectId: null,
        canvasPresenceVersion: 0,
      };
      this.conns.add(conn);
      this.send(conn, {
        type: 'ready',
        connId: conn.connId,
        userId,
        role,
        isAgent,
      });

      if (isAgent) {
        void this.csDesk
          .setPresence(userId, 'online')
          .catch((err) =>
            this.logger.warn(
              `setPresence online failed: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      }

      ws.on('pong', () => {
        conn.isAlive = true;
      });
      ws.on('message', (data) => {
        void this.onMessage(conn, data);
      });
      ws.on('close', (code) => {
        this.logger.debug(`客服实时连接已关闭：${code}`);
        void this.cleanup(conn);
      });
      ws.on('error', () => {
        void this.cleanup(conn);
      });
    });
  }

  private send(conn: CsWsConn, payload: Record<string, unknown>) {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    try {
      conn.ws.send(JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  private joinRoom(conn: CsWsConn, conversationId: string) {
    conn.rooms.add(conversationId);
    let set = this.rooms.get(conversationId);
    if (!set) {
      set = new Set();
      this.rooms.set(conversationId, set);
    }
    set.add(conn);
  }

  private leaveRoom(conn: CsWsConn, conversationId: string) {
    conn.rooms.delete(conversationId);
    const set = this.rooms.get(conversationId);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) this.rooms.delete(conversationId);
  }

  private async cleanup(conn: CsWsConn) {
    this.clearCanvasCursor(conn);
    for (const room of [...conn.rooms]) {
      this.leaveRoom(conn, room);
    }
    this.conns.delete(conn);
    if (conn.isAgent) {
      // 若同用户仍有其他 CS WS 连接，保持 online
      const stillConnected = [...this.conns].some(
        (c) => c.userId === conn.userId && c.isAgent,
      );
      if (!stillConnected) {
        try {
          await this.csDesk.setPresence(conn.userId, 'offline');
        } catch {
          // ignore
        }
      }
    }
  }

  private heartbeat() {
    for (const conn of [...this.conns]) {
      if (!conn.isAlive) {
        try {
          conn.ws.terminate();
        } catch {
          // ignore
        }
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

  broadcast(conversationId: string, event: Record<string, unknown>) {
    const set = this.rooms.get(conversationId);
    if (!set) return;
    for (const conn of set) {
      this.send(conn, event);
    }
  }

  private clearCanvasCursor(conn: CsWsConn) {
    if (!conn.canvasProjectId) return;
    for (const peer of this.conns) {
      if (peer !== conn && peer.canvasProjectId === conn.canvasProjectId) {
        this.send(peer, { type: 'canvas_cursor', projectId: conn.canvasProjectId, userId: conn.userId, hidden: true });
      }
    }
  }

  private async onMessage(conn: CsWsConn, raw: RawData) {
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return this.send(conn, { type: 'error', message: 'invalid json' });
    }
    const type = String(msg?.type || '');
    const conversationId = String(msg?.conversationId || '').trim();

    try {
      if (type === 'canvas_presence') {
        const version = ++conn.canvasPresenceVersion;
        this.clearCanvasCursor(conn);
        conn.canvasProjectId = null;
        const projectId = typeof msg.projectId === 'string' ? msg.projectId.trim() : '';
        if (!projectId) return this.send(conn, { type: 'canvas_ready', projectId: null });
        if (conversationId && conn.isAgent) {
          const target = await this.csDesk.getCanvasTarget(conversationId, conn.userId);
          if (version === conn.canvasPresenceVersion && target.projectId === projectId) {
            conn.canvasProjectId = projectId;
            this.send(conn, { type: 'canvas_ready', projectId });
          }
          return;
        }
        const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { userId: true, teamId: true } });
        if (version === conn.canvasPresenceVersion && project?.userId === conn.userId && !project.teamId) {
          conn.canvasProjectId = projectId;
          this.send(conn, { type: 'canvas_ready', projectId });
        }
        return;
      }
      if (type === 'canvas_cursor') {
        const projectId = conn.canvasProjectId;
        if (!projectId || msg.projectId !== projectId) return;
        const hidden = msg.hidden === true;
        if (!hidden && (!Number.isFinite(msg.x) || !Number.isFinite(msg.y))) return;
        const collab = await this.prisma.csCollabRequest.findFirst({
          where: {
            projectId,
            conversation: { status: 'active', OR: [{ userId: conn.userId }, { agentId: conn.userId }] },
          },
          orderBy: { createdAt: 'desc' },
          include: { conversation: { include: { user: { select: { name: true } }, agent: { select: { name: true, isCsAgent: true } } } } },
        });
        if (!collab || collab.status !== 'accepted' || collab.endedAt ||
            collab.agentId !== collab.conversation.agentId || !collab.conversation.agent?.isCsAgent ||
            conn.canvasProjectId !== projectId) return;
        const customerId = collab.conversation.userId;
        const agentId = collab.agentId;
        const isCustomer = conn.userId === customerId;
        if (!isCustomer && (!conn.isAgent || conn.userId !== agentId)) return;
        const event = {
          type: 'canvas_cursor', projectId, userId: conn.userId, hidden,
          name: (isCustomer ? collab.conversation.user.name : collab.conversation.agent.name) || (isCustomer ? '客户' : '客服'),
          color: isCustomer ? '#38bdf8' : '#fb923c', x: msg.x, y: msg.y,
        };
        for (const peer of this.conns) {
          if (peer.userId === (isCustomer ? agentId : customerId) && peer.canvasProjectId === projectId) this.send(peer, event);
        }
        return;
      }
      if (type === 'join') {
        if (!conversationId) {
          return this.send(conn, { type: 'error', message: 'missing conversationId' });
        }
        await this.csDesk.assertCanAccessConversation(
          conversationId,
          conn.userId,
          conn.isAgent,
        );
        this.joinRoom(conn, conversationId);
        return this.send(conn, { type: 'joined', conversationId });
      }
      if (type === 'leave') {
        if (conversationId) this.leaveRoom(conn, conversationId);
        return;
      }
      if (type === 'typing') {
        if (!conversationId || !conn.rooms.has(conversationId)) return;
        this.broadcast(conversationId, {
          type: 'typing',
          conversationId,
          userId: conn.userId,
          typing: Boolean(msg?.typing),
        });
        return;
      }
      if (type === 'read') {
        if (!conversationId) return;
        await this.csDesk.markRead(conversationId, {
          userId: conn.userId,
          isAgent: conn.isAgent,
        });
        return;
      }
    } catch (err) {
      this.send(conn, {
        type: type === 'canvas_presence' ? 'canvas_error' : 'error',
        message: err instanceof Error ? err.message : 'error',
      });
    }
  }
}
