import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from '../teams/teams.service';
import type {
  CollaborationContentUpdatePayload,
  CollaborationPeer,
  CollaborationSelectionPayload,
  CollaborationUserPayload,
  CollaborationViewportPayload,
} from './collaboration.types';

/** Figma 风格协作色板 */
const PEER_COLORS = [
  '#F24822',
  '#FFA629',
  '#FFCD29',
  '#14AE5C',
  '#009951',
  '#007BE5',
  '#9747FF',
  '#EB5757',
  '#F24E1E',
  '#A259FF',
  '#1ABCFE',
  '#0ACF83',
] as const;

const MAX_INLINE_PAPER_JSON = 512 * 1024;

@Injectable()
export class CollaborationService {
  private readonly rooms = new Map<string, Map<string, CollaborationPeer>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly teams: TeamsService,
  ) {}

  colorForUser(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i += 1) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
  }

  displayName(user: CollaborationUserPayload): string {
    if (user.name?.trim()) return user.name.trim();
    const id = user.id || user.sub;
    return id ? `用户-${id.slice(-6)}` : '用户';
  }

  async verifyToken(token?: string | null): Promise<CollaborationUserPayload | null> {
    if (!token?.trim()) return null;
    try {
      const secret =
        this.config.get<string>('JWT_ACCESS_SECRET') || 'dev-access-secret';
      const payload = await this.jwt.verifyAsync<CollaborationUserPayload>(token.trim(), {
        secret,
      });
      if (!payload?.sub && !payload?.id) return null;
      return payload;
    } catch {
      return null;
    }
  }

  roomKey(projectId: string): string {
    return `project:${projectId}`;
  }

  async assertProjectAccess(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, teamId: true },
    });
    if (!project) throw new NotFoundException('项目不存在');
    if (project.teamId) {
      await this.teams.assertTeamMember(project.teamId, userId);
      return;
    }
    if (project.userId !== userId) {
      throw new NotFoundException('项目不存在');
    }
  }

  joinRoom(
    room: string,
    peerId: string,
    user: CollaborationUserPayload,
  ): { self: CollaborationPeer; peers: CollaborationPeer[] } {
    const userId = user.id || user.sub;
    let roomMap = this.rooms.get(room);
    if (!roomMap) {
      roomMap = new Map();
      this.rooms.set(room, roomMap);
    }

    const self: CollaborationPeer = {
      peerId,
      userId,
      name: this.displayName(user),
      color: this.colorForUser(userId),
      visible: false,
    };
    roomMap.set(peerId, self);

    const peers = [...roomMap.values()].filter((p) => p.peerId !== peerId);
    return { self, peers };
  }

  leaveRoom(room: string, peerId: string): CollaborationPeer | null {
    const roomMap = this.rooms.get(room);
    if (!roomMap) return null;
    const peer = roomMap.get(peerId) ?? null;
    roomMap.delete(peerId);
    if (roomMap.size === 0) {
      this.rooms.delete(room);
    }
    return peer;
  }

  getPeer(room: string, peerId: string): CollaborationPeer | null {
    return this.rooms.get(room)?.get(peerId) ?? null;
  }

  updateCursor(
    room: string,
    peerId: string,
    payload: { x: number; y: number; visible?: boolean },
  ): CollaborationPeer | null {
    const peer = this.getPeer(room, peerId);
    if (!peer) return null;
    peer.x = payload.x;
    peer.y = payload.y;
    peer.visible = payload.visible !== false;
    return peer;
  }

  updateViewport(
    room: string,
    peerId: string,
    payload: CollaborationViewportPayload,
  ): CollaborationPeer | null {
    const peer = this.getPeer(room, peerId);
    if (!peer) return null;
    peer.viewport = {
      panX: payload.panX,
      panY: payload.panY,
      zoom: payload.zoom,
    };
    return peer;
  }

  updateSelection(
    room: string,
    peerId: string,
    payload: CollaborationSelectionPayload,
  ): CollaborationPeer | null {
    const peer = this.getPeer(room, peerId);
    if (!peer) return null;
    peer.selection = payload;
    return peer;
  }

  buildContentUpdate(
    room: string,
    peerId: string,
    body: {
      seq?: number;
      contentHash?: string;
      updatedAt?: string;
      paperJson?: string;
      layers?: unknown[];
      activeLayerId?: string | null;
      assets?: unknown;
      comments?: unknown[];
    },
  ): CollaborationContentUpdatePayload | null {
    const peer = this.getPeer(room, peerId);
    if (!peer) return null;

    const seq = Number(body?.seq);
    const contentHash = typeof body?.contentHash === 'string' ? body.contentHash.trim() : '';
    const updatedAt = typeof body?.updatedAt === 'string' ? body.updatedAt.trim() : '';
    if (!Number.isFinite(seq) || seq <= 0 || !contentHash || !updatedAt) {
      return null;
    }

    const paperJson =
      typeof body.paperJson === 'string' &&
      body.paperJson.length > 0 &&
      body.paperJson.length <= MAX_INLINE_PAPER_JSON
        ? body.paperJson
        : undefined;

    return {
      peerId: peer.peerId,
      userId: peer.userId,
      seq,
      contentHash,
      updatedAt,
      paperJson,
      layers: body.layers,
      activeLayerId: body.activeLayerId,
      assets: body.assets,
      comments: body.comments,
    };
  }

  listPeers(room: string): CollaborationPeer[] {
    return [...(this.rooms.get(room)?.values() ?? [])];
  }
}
