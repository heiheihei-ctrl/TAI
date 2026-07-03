import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './authTokenStorage';

export interface CollaborationPeer {
  peerId: string;
  userId: string;
  name: string;
  color: string;
  x?: number;
  y?: number;
  visible?: boolean;
}

export type CollaborationCursorPayload = CollaborationPeer & {
  x: number;
  y: number;
  visible?: boolean;
};

type PeerListener = (peers: Map<string, CollaborationPeer>) => void;

const CURSOR_STALE_MS = 8000;

function resolveSocketBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured?.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:4000';
}

class CollaborationSocketManager {
  private socket: Socket | null = null;
  private projectId: string | null = null;
  private peers = new Map<string, CollaborationPeer>();
  private listeners = new Set<PeerListener>();
  private staleTimer: number | null = null;

  private notify() {
    for (const listener of this.listeners) {
      listener(new Map(this.peers));
    }
  }

  private ensureStaleSweep() {
    if (this.staleTimer != null || typeof window === 'undefined') return;
    this.staleTimer = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [peerId, peer] of this.peers) {
        const lastSeen = (peer as CollaborationPeer & { lastSeen?: number }).lastSeen ?? 0;
        if (now - lastSeen > CURSOR_STALE_MS) {
          this.peers.delete(peerId);
          changed = true;
        }
      }
      if (changed) this.notify();
    }, 2000);
  }

  private clearStaleSweep() {
    if (this.staleTimer != null && typeof window !== 'undefined') {
      window.clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private attachHandlers(socket: Socket) {
    socket.on('collab:peer-join', (payload: { peer?: CollaborationPeer }) => {
      const peer = payload?.peer;
      if (!peer?.peerId) return;
      this.peers.set(peer.peerId, { ...peer, lastSeen: Date.now() } as CollaborationPeer & {
        lastSeen: number;
      });
      this.notify();
    });

    socket.on(
      'collab:peer-leave',
      (payload: { peerId?: string }) => {
        if (!payload?.peerId) return;
        this.peers.delete(payload.peerId);
        this.notify();
      },
    );

    socket.on('collab:cursor', (payload: CollaborationCursorPayload) => {
      if (!payload?.peerId) return;
      this.peers.set(payload.peerId, {
        ...payload,
        lastSeen: Date.now(),
      } as CollaborationPeer & { lastSeen: number });
      this.notify();
    });
  }

  subscribe(listener: PeerListener): () => void {
    this.listeners.add(listener);
    listener(new Map(this.peers));
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(projectId: string): Promise<void> {
    const normalized = projectId.trim();
    if (!normalized) return;

    if (this.projectId === normalized && this.socket?.connected) {
      return;
    }

    this.disconnect();

    const token = getAccessToken();
    if (!token) return;

    const socket = io(`${resolveSocketBaseUrl()}/collaboration`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: { token },
    });

    this.socket = socket;
    this.projectId = normalized;
    this.attachHandlers(socket);
    this.ensureStaleSweep();

    await new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        socket.off('connect_error', onError);
        resolve();
      };
      const onError = (error: Error) => {
        socket.off('connect', onConnect);
        reject(error);
      };
      socket.once('connect', onConnect);
      socket.once('connect_error', onError);
    });

    const result = await socket.emitWithAck('collab:join', { projectId: normalized });
    if (!result?.ok) {
      throw new Error(result?.message || '加入协作房间失败');
    }

    this.peers.clear();
    for (const peer of (result.peers ?? []) as CollaborationPeer[]) {
      this.peers.set(peer.peerId, peer);
    }
    this.notify();
  }

  emitCursor(projectId: string, x: number, y: number, visible = true) {
    if (!this.socket?.connected || !this.projectId) return;
    this.socket.emit('collab:cursor', { projectId, x, y, visible });
  }

  disconnect() {
    this.clearStaleSweep();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.projectId = null;
    this.peers.clear();
    this.notify();
  }
}

export const collaborationSocket = new CollaborationSocketManager();
