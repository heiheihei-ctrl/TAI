import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './authTokenStorage';
import { tokenRefreshManager } from './tokenRefreshManager';

export interface CollaborationPeer {
  peerId: string;
  userId: string;
  name: string;
  color: string;
  x?: number;
  y?: number;
  visible?: boolean;
  lastSeen?: number;
  viewport?: CollaborationViewportState;
  selection?: CollaborationSelectionState;
}

export interface CollaborationViewportState {
  peerId: string;
  userId: string;
  name: string;
  color: string;
  panX: number;
  panY: number;
  zoom: number;
  lastSeen?: number;
}

export interface CollaborationBoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollaborationSelectionState {
  peerId: string;
  userId: string;
  name: string;
  color: string;
  imageIds: string[];
  modelIds: string[];
  videoIds: string[];
  textIds: string[];
  pathBounds: CollaborationBoundsRect[];
  marqueeBounds?: CollaborationBoundsRect | null;
  lastSeen?: number;
}

export interface CollaborationContentUpdatePayload {
  peerId: string;
  userId: string;
  seq: number;
  contentHash: string;
  updatedAt: string;
  paperJson?: string;
  layers?: unknown[];
  activeLayerId?: string | null;
  assets?: unknown;
}

export type CollaborationCursorPayload = CollaborationPeer & {
  x: number;
  y: number;
  visible?: boolean;
};

type PeerListener = (peers: Map<string, CollaborationPeer>) => void;
type ViewportListener = (viewports: Map<string, CollaborationViewportState>) => void;
type SelectionListener = (selections: Map<string, CollaborationSelectionState>) => void;
type ContentListener = (payload: CollaborationContentUpdatePayload) => void;

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
  private selfPeerId: string | null = null;
  private selfUserId: string | null = null;
  private connectRefCount = 0;
  private peers = new Map<string, CollaborationPeer>();
  private viewports = new Map<string, CollaborationViewportState>();
  private selections = new Map<string, CollaborationSelectionState>();
  private peerListeners = new Set<PeerListener>();
  private viewportListeners = new Set<ViewportListener>();
  private selectionListeners = new Set<SelectionListener>();
  private contentListeners = new Set<ContentListener>();
  private rejoinOnConnect = false;
  private joining = false;
  private tokenUnsub: (() => void) | null = null;

  getSelfPeerId(): string | null {
    return this.selfPeerId;
  }

  getSelfUserId(): string | null {
    return this.selfUserId;
  }

  isConnected(): boolean {
    return !!this.socket?.connected && !!this.selfPeerId;
  }

  private notifyPeers() {
    for (const listener of this.peerListeners) {
      listener(new Map(this.peers));
    }
  }

  private notifyViewports() {
    for (const listener of this.viewportListeners) {
      listener(new Map(this.viewports));
    }
  }

  private notifySelections() {
    for (const listener of this.selectionListeners) {
      listener(new Map(this.selections));
    }
  }

  private ensureTokenRefreshHook() {
    if (this.tokenUnsub) return;
    this.tokenUnsub = tokenRefreshManager.subscribe((event) => {
      if (event !== 'token-refreshed' || !this.socket) return;
      const token = getAccessToken();
      if (!token) return;
      this.socket.auth = { token };
      if (!this.socket.connected) {
        this.socket.connect();
      }
    });
  }

  private upsertPeer(peer: CollaborationPeer) {
    if (!peer?.peerId || peer.peerId === this.selfPeerId) return;
    this.peers.set(peer.peerId, {
      ...peer,
      lastSeen: Date.now(),
    });
    this.notifyPeers();
  }

  private removePeer(peerId: string) {
    this.peers.delete(peerId);
    this.viewports.delete(peerId);
    this.selections.delete(peerId);
    this.notifyPeers();
    this.notifyViewports();
    this.notifySelections();
  }

  private attachHandlers(socket: Socket) {
    socket.on('collab:peer-join', (payload: { peer?: CollaborationPeer }) => {
      const peer = payload?.peer;
      if (!peer?.peerId) return;
      this.upsertPeer(peer);
    });

    socket.on('collab:peer-leave', (payload: { peerId?: string }) => {
      if (!payload?.peerId) return;
      this.removePeer(payload.peerId);
    });

    socket.on('collab:cursor', (payload: CollaborationCursorPayload) => {
      if (!payload?.peerId) return;
      this.upsertPeer(payload);
    });

    socket.on('collab:viewport', (payload: CollaborationViewportState) => {
      if (!payload?.peerId || payload.peerId === this.selfPeerId) return;
      this.viewports.set(payload.peerId, { ...payload, lastSeen: Date.now() });
      this.notifyViewports();
    });

    socket.on('collab:selection', (payload: CollaborationSelectionState) => {
      if (!payload?.peerId || payload.peerId === this.selfPeerId) return;
      this.selections.set(payload.peerId, { ...payload, lastSeen: Date.now() });
      this.notifySelections();
    });

    socket.on('collab:content-update', (payload: CollaborationContentUpdatePayload) => {
      if (!payload?.peerId || payload.userId === this.selfUserId) return;
      for (const listener of this.contentListeners) {
        listener(payload);
      }
    });

    socket.on('connect', () => {
      if (!this.rejoinOnConnect || !this.projectId || this.joining) return;
      void this.joinRoom().catch((error) => {
        console.warn('[collaboration] re-join failed:', error);
      });
    });

    socket.on('disconnect', () => {
      this.peers.clear();
      this.viewports.clear();
      this.selections.clear();
      this.selfPeerId = null;
      this.selfUserId = null;
      this.notifyPeers();
      this.notifyViewports();
      this.notifySelections();
    });
  }

  subscribePeers(listener: PeerListener): () => void {
    this.peerListeners.add(listener);
    listener(new Map(this.peers));
    return () => this.peerListeners.delete(listener);
  }

  subscribeViewports(listener: ViewportListener): () => void {
    this.viewportListeners.add(listener);
    listener(new Map(this.viewports));
    return () => this.viewportListeners.delete(listener);
  }

  subscribeSelections(listener: SelectionListener): () => void {
    this.selectionListeners.add(listener);
    listener(new Map(this.selections));
    return () => this.selectionListeners.delete(listener);
  }

  subscribeContentUpdates(listener: ContentListener): () => void {
    this.contentListeners.add(listener);
    return () => this.contentListeners.delete(listener);
  }

  /** @deprecated use subscribePeers */
  subscribe(listener: PeerListener): () => void {
    return this.subscribePeers(listener);
  }

  private async joinRoom(): Promise<void> {
    if (!this.socket?.connected || !this.projectId || this.joining) return;

    this.joining = true;
    try {
      const result = await this.socket.emitWithAck('collab:join', {
        projectId: this.projectId,
      });
      if (!result?.ok) {
        throw new Error(result?.message || '加入协作房间失败');
      }

      this.selfPeerId = result.self?.peerId ?? null;
      this.selfUserId = result.self?.userId ?? null;
      this.peers.clear();
      this.viewports.clear();
      this.selections.clear();

      const now = Date.now();
      for (const peer of (result.peers ?? []) as CollaborationPeer[]) {
        if (!peer.peerId || peer.peerId === this.selfPeerId) continue;
        this.peers.set(peer.peerId, { ...peer, lastSeen: now });
        if (peer.viewport) {
          this.viewports.set(peer.peerId, {
            ...peer.viewport,
            peerId: peer.peerId,
            userId: peer.userId,
            name: peer.name,
            color: peer.color,
            lastSeen: now,
          });
        }
        if (peer.selection) {
          this.selections.set(peer.peerId, {
            ...peer.selection,
            peerId: peer.peerId,
            userId: peer.userId,
            name: peer.name,
            color: peer.color,
            lastSeen: now,
          });
        }
      }

      this.notifyPeers();
      this.notifyViewports();
      this.notifySelections();
    } finally {
      this.joining = false;
    }
  }

  async connect(projectId: string): Promise<void> {
    const normalized = projectId.trim();
    if (!normalized) return;

    this.connectRefCount += 1;
    this.ensureTokenRefreshHook();

    if (this.projectId === normalized && this.socket?.connected && this.selfPeerId) {
      return;
    }

    await this.forceConnect(normalized);
  }

  private async forceConnect(normalized: string): Promise<void> {
    this.hardDisconnect(false);

    const token = getAccessToken();
    if (!token) {
      console.warn('[collaboration] 无 access_token，无法建立协作连接');
      return;
    }

    const socket = io(`${resolveSocketBaseUrl()}/collaboration`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket = socket;
    this.projectId = normalized;
    this.rejoinOnConnect = false;
    this.attachHandlers(socket);

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('协作连接超时'));
      }, 12000);

      const onConnect = () => {
        window.clearTimeout(timeout);
        socket.off('connect_error', onError);
        resolve();
      };
      const onError = (error: Error) => {
        window.clearTimeout(timeout);
        socket.off('connect', onConnect);
        reject(error);
      };
      socket.once('connect', onConnect);
      socket.once('connect_error', onError);
    });

    await this.joinRoom();
    this.rejoinOnConnect = true;
  }

  emitCursor(projectId: string, x: number, y: number, visible = true) {
    if (!this.socket?.connected || !this.projectId) return;
    if (this.projectId !== projectId) return;
    this.socket.emit('collab:cursor', { projectId, x, y, visible });
  }

  emitViewport(projectId: string, panX: number, panY: number, zoom: number) {
    if (!this.socket?.connected || !this.projectId) return;
    if (this.projectId !== projectId) return;
    this.socket.emit('collab:viewport', { projectId, panX, panY, zoom });
  }

  emitSelection(
    projectId: string,
    selection: Omit<
      CollaborationSelectionState,
      'peerId' | 'userId' | 'name' | 'color' | 'lastSeen'
    >,
  ) {
    if (!this.socket?.connected || !this.projectId) return;
    if (this.projectId !== projectId) return;
    this.socket.emit('collab:selection', { projectId, ...selection });
  }

  emitContentUpdate(
    projectId: string,
    payload: Omit<CollaborationContentUpdatePayload, 'peerId' | 'userId'>,
  ) {
    if (!this.socket?.connected || !this.projectId) return;
    if (this.projectId !== projectId) return;
    this.socket.emit('collab:content-update', { projectId, ...payload });
  }

  disconnect() {
    this.connectRefCount = Math.max(0, this.connectRefCount - 1);
    if (this.connectRefCount > 0) return;
    this.hardDisconnect(true);
  }

  private hardDisconnect(resetRefCount = false) {
    if (resetRefCount) {
      this.connectRefCount = 0;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.projectId = null;
    this.selfPeerId = null;
    this.selfUserId = null;
    this.rejoinOnConnect = false;
    this.joining = false;
    this.peers.clear();
    this.viewports.clear();
    this.selections.clear();
    this.notifyPeers();
    this.notifyViewports();
    this.notifySelections();
  }
}

export const collaborationSocket = new CollaborationSocketManager();

export function dedupePeersByUser(
  peers: CollaborationPeer[],
): CollaborationPeer[] {
  const byUser = new Map<string, CollaborationPeer>();
  for (const peer of peers) {
    const existing = byUser.get(peer.userId);
    if (!existing) {
      byUser.set(peer.userId, peer);
      continue;
    }
    const existingSeen = existing.lastSeen ?? 0;
    const peerSeen = peer.lastSeen ?? 0;
    if (peerSeen >= existingSeen) {
      byUser.set(peer.userId, peer);
    }
  }
  return [...byUser.values()];
}

export function dedupeByUserId<T extends { userId: string; lastSeen?: number }>(
  items: T[],
): T[] {
  const byUser = new Map<string, T>();
  for (const item of items) {
    const existing = byUser.get(item.userId);
    if (!existing) {
      byUser.set(item.userId, item);
      continue;
    }
    const existingSeen = existing.lastSeen ?? 0;
    const itemSeen = item.lastSeen ?? 0;
    if (itemSeen >= existingSeen) {
      byUser.set(item.userId, item);
    }
  }
  return [...byUser.values()];
}
