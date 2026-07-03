import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { CollaborationService } from './collaboration.service';
import type { CollaborationUserPayload } from './collaboration.types';

type AuthedSocket = Socket & {
  data: {
    user?: CollaborationUserPayload;
    projectId?: string;
    room?: string;
  };
};

@WebSocketGateway({
  namespace: '/collaboration',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class CollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(CollaborationGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly collaboration: CollaborationService) {}

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }
    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }
    const cookie = client.handshake.headers?.cookie;
    if (typeof cookie === 'string') {
      const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    return null;
  }

  async handleConnection(client: AuthedSocket) {
    const user = await this.collaboration.verifyToken(this.extractToken(client));
    if (!user) {
      client.disconnect(true);
      return;
    }
    client.data.user = user;
  }

  async handleDisconnect(client: AuthedSocket) {
    const room = client.data.room;
    if (!room) return;
    const peer = this.collaboration.leaveRoom(room, client.id);
    if (peer) {
      client.to(room).emit('collab:peer-leave', {
        peerId: peer.peerId,
        userId: peer.userId,
      });
    }
    client.leave(room);
  }

  @SubscribeMessage('collab:join')
  async handleJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { projectId?: string },
  ) {
    const user = client.data.user;
    if (!user) {
      return { ok: false, message: '未登录' };
    }

    const projectId = body?.projectId?.trim();
    if (!projectId) {
      return { ok: false, message: '缺少 projectId' };
    }

    const userId = user.id || user.sub;
    try {
      await this.collaboration.assertProjectAccess(userId, projectId);
    } catch (error: any) {
      return { ok: false, message: error?.message || '无权访问该项目' };
    }

    const prevRoom = client.data.room;
    if (prevRoom) {
      const prevPeer = this.collaboration.leaveRoom(prevRoom, client.id);
      client.leave(prevRoom);
      if (prevPeer) {
        client.to(prevRoom).emit('collab:peer-leave', {
          peerId: prevPeer.peerId,
          userId: prevPeer.userId,
        });
      }
    }

    const room = this.collaboration.roomKey(projectId);
    const { self, peers } = this.collaboration.joinRoom(room, client.id, user);
    client.data.projectId = projectId;
    client.data.room = room;
    await client.join(room);

    client.to(room).emit('collab:peer-join', { peer: self });

    return {
      ok: true,
      self,
      peers,
    };
  }

  @SubscribeMessage('collab:cursor')
  handleCursor(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { projectId?: string; x?: number; y?: number; visible?: boolean },
  ) {
    const user = client.data.user;
    const room = client.data.room;
    if (!user || !room) return;

    if (body?.projectId && client.data.projectId !== body.projectId) {
      return;
    }

    const x = Number(body?.x);
    const y = Number(body?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const peer = this.collaboration.updateCursor(room, client.id, {
      x,
      y,
      visible: body?.visible,
    });
    if (!peer) return;

    client.to(room).emit('collab:cursor', {
      peerId: peer.peerId,
      userId: peer.userId,
      name: peer.name,
      color: peer.color,
      x: peer.x,
      y: peer.y,
      visible: peer.visible,
    });
  }
}
