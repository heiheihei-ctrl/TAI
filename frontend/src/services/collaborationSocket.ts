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
  flowNodeIds: string[];
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

export interface FlowPatchPayload {
  upsertNodes?: unknown[];
  removeNodeIds?: string[];
  upsertEdges?: unknown[];
  removeEdgeIds?: string[];
}

export interface CollaborationFlowPatchMessage {
  peerId: string;
  userId: string;
  patch: FlowPatchPayload;
}

type PeerListener = (peers: Map<string, CollaborationPeer>) => void;
type ViewportListener = (viewports: Map<string, CollaborationViewportState>) => void;
type SelectionListener = (selections: Map<string, CollaborationSelectionState>) => void;
type ContentListener = (payload: CollaborationContentUpdatePayload) => void;
type ConnectionListener = (state: { connected: boolean; projectId: string | null }) => void;
type FlowPatchListener = (message: CollaborationFlowPatchMessage) => void;

function resolveSocketBaseUrl(): string {
  // 开发环境走 Vite 同源代理（/socket.io → backend），避免 LAN/隧道下 localhost 指向错误机器
  // if (import.meta.env.DEV && typeof window !== 'undefined') {
  //   return window.location.origin;
  // }

  // const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  // if (configured?.trim()) {
  //   return configured.trim().replace(/\/api\/?$/, '').replace(/\/+$/, '');
  // }
  // if (typeof window !== 'undefined') {
  //   return window.location.origin;
  // }
  // return 'http://localhost:4000';
  return 'http://http://101.96.217.132:4000';
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
  private connectionListeners = new Set<ConnectionListener>();
  private flowPatchListeners = new Set<FlowPatchListener>();
  private rejoinOnConnect = false;
  private connectPromise: Promise<void> | null = null;
  private tokenUnsub: (() => void) | null = null;
  /** 串行化房间加入，避免切换项目时 join 被跳过 */
  private joinChain: Promise<void> = Promise.resolve();
  private lastJoinedProjectId: string | null = null;
  /** join 完成前缓存的光标，对齐 Tanva 切项目后立即恢复可见 */
  private pendingCursor: { projectId: string; x: number; y: number; visible: boolean } | null =
    null;
  /** 本地选区缓存，画布与 Flow 分开发射时合并后再广播 */
  private localSelection: Omit<
    CollaborationSelectionState,
    'peerId' | 'userId' | 'name' | 'color' | 'lastSeen'
  > = {
    imageIds: [],
    modelIds: [],
    videoIds: [],
    textIds: [],
    pathBounds: [],
    marqueeBounds: null,
    flowNodeIds: [],
  };

  getSelfPeerId(): string | null {
    return this.selfPeerId;
  }

  getSelfUserId(): string | null {
    return this.selfUserId;
  }

  isConnected(): boolean {
    return !!this.socket?.connected && !!this.selfPeerId;
  }

  /** 当前 socket 已成功加入指定项目房间（可安全广播光标/选区） */
  isReadyForProject(projectId: string): boolean {
    const normalized = projectId.trim();
    if (!normalized) return false;
    return (
      !!this.socket?.connected &&
      !!this.selfPeerId &&
      this.projectId === normalized &&
      this.lastJoinedProjectId === normalized
    );
  }

  /** 确保已加入指定项目协作房间（切换项目时调用） */
  async ensureProject(projectId: string): Promise<void> {
    return this.switchProject(projectId);
  }

  private emitConnectionState() {
    const state = {
      connected: this.projectId
        ? this.isReadyForProject(this.projectId)
        : false,
      projectId: this.projectId,
    };
    for (const listener of this.connectionListeners) {
      listener(state);
    }
  }

  subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener({
      connected: this.projectId
        ? this.isReadyForProject(this.projectId)
        : false,
      projectId: this.projectId,
    });
    return () => this.connectionListeners.delete(listener);
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
      this.selections.set(payload.peerId, {
        ...payload,
        flowNodeIds: payload.flowNodeIds ?? [],
        lastSeen: Date.now(),
      });
      this.notifySelections();
    });

    socket.on('collab:content-update', (payload: CollaborationContentUpdatePayload) => {
      if (!payload?.peerId || payload.userId === this.selfUserId) return;
      for (const listener of this.contentListeners) {
        listener(payload);
      }
    });

    socket.on('collab:flow-patch', (payload: CollaborationFlowPatchMessage) => {
      if (!payload?.peerId || payload.peerId === this.selfPeerId) return;
      if (payload.userId && payload.userId === this.selfUserId) return;
      for (const listener of this.flowPatchListeners) {
        listener(payload);
      }
    });

    socket.on('connect', () => {
      if (!this.rejoinOnConnect || !this.projectId) return;
      void this.scheduleJoin().catch((error) => {
        console.warn('[collaboration] re-join failed:', error);
      });
    });

    socket.on('disconnect', () => {
      this.peers.clear();
      this.viewports.clear();
      this.selections.clear();
      this.selfPeerId = null;
      this.selfUserId = null;
      this.lastJoinedProjectId = null;
      this.notifyPeers();
      this.notifyViewports();
      this.notifySelections();
      this.emitConnectionState();
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

  subscribeFlowPatches(listener: FlowPatchListener): () => void {
    this.flowPatchListeners.add(listener);
    return () => this.flowPatchListeners.delete(listener);
  }

  /** @deprecated use subscribePeers */
  subscribe(listener: PeerListener): () => void {
    return this.subscribePeers(listener);
  }

  private async executeJoin(): Promise<void> {
    const targetProjectId = this.projectId?.trim();
    if (!this.socket?.connected || !targetProjectId) return;

    if (
      this.lastJoinedProjectId === targetProjectId &&
      this.selfPeerId
    ) {
      this.emitConnectionState();
      return;
    }

    const result = await this.socket.emitWithAck('collab:join', {
      projectId: targetProjectId,
    });
    if (!result?.ok) {
      throw new Error(result?.message || '加入协作房间失败');
    }

    // 加入过程中项目又切换了，交给队列中的下一次 join 处理
    if (this.projectId?.trim() !== targetProjectId) return;

    this.selfPeerId = result.self?.peerId ?? null;
    this.selfUserId = result.self?.userId ?? null;
    this.lastJoinedProjectId = targetProjectId;
    this.peers.clear();
    this.viewports.clear();
    this.selections.clear();
    this.localSelection = {
      imageIds: [],
      modelIds: [],
      videoIds: [],
      textIds: [],
      pathBounds: [],
      marqueeBounds: null,
      flowNodeIds: [],
    };

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
          flowNodeIds: peer.selection.flowNodeIds ?? [],
          lastSeen: now,
        });
      }
    }

    this.notifyPeers();
    this.notifyViewports();
    this.notifySelections();
    this.emitConnectionState();
    this.flushPendingCursor();
  }

  private flushPendingCursor() {
    const pending = this.pendingCursor;
    if (!pending || !this.isReadyForProject(pending.projectId) || !this.socket) {
      return;
    }
    this.pendingCursor = null;
    this.socket.emit('collab:cursor', {
      projectId: pending.projectId,
      x: pending.x,
      y: pending.y,
      visible: pending.visible,
    });
  }

  private scheduleJoin(): Promise<void> {
    this.joinChain = this.joinChain
      .then(() => this.executeJoin())
      .catch((error) => {
        console.warn('[collaboration] join failed:', error);
        this.emitConnectionState();
      });
    return this.joinChain;
  }

  /** @deprecated 内部请用 scheduleJoin */
  private async joinRoom(): Promise<void> {
    await this.scheduleJoin();
  }

  /** 切换协作房间（同 socket 重入，用于团队内切换项目） */
  async switchProject(projectId: string): Promise<void> {
    const normalized = projectId.trim();
    if (!normalized) return;

    this.ensureTokenRefreshHook();

    if (this.isReadyForProject(normalized)) {
      this.emitConnectionState();
      return;
    }

    this.projectId = normalized;

    if (!this.socket?.connected) {
      if (this.connectRefCount === 0) {
        this.connectRefCount = 1;
      }
      if (this.connectPromise) {
        await this.connectPromise;
        if (!this.isReadyForProject(normalized)) {
          await this.scheduleJoin();
        }
        this.emitConnectionState();
        return;
      }
      await this.forceConnect(normalized);
      this.rejoinOnConnect = true;
      return;
    }

    this.localSelection = {
      imageIds: [],
      modelIds: [],
      videoIds: [],
      textIds: [],
      pathBounds: [],
      marqueeBounds: null,
      flowNodeIds: [],
    };

    await this.scheduleJoin();
    let retries = 0;
    while (
      this.projectId &&
      this.lastJoinedProjectId !== this.projectId &&
      this.socket?.connected &&
      retries < 3
    ) {
      retries += 1;
      await this.scheduleJoin();
    }
    this.emitConnectionState();
  }

  async connect(projectId: string): Promise<void> {
    const normalized = projectId.trim();
    if (!normalized) return;

    this.ensureTokenRefreshHook();

    try {
      if (this.isReadyForProject(normalized)) {
        this.emitConnectionState();
        return;
      }

      // 已在线：仅换房间，不增加 refCount（对齐 Tanva setContext 只改 projectId）
      if (this.socket?.connected) {
        await this.switchProject(normalized);
        return;
      }

      // 首次建连才占用会话引用
      this.connectRefCount += 1;

      if (!this.connectPromise) {
        this.connectPromise = this.forceConnect(normalized).finally(() => {
          this.connectPromise = null;
        });
      }
      await this.connectPromise;

      const latest = this.projectId?.trim() || normalized;
      if (!this.isReadyForProject(latest)) {
        await this.switchProject(latest);
      }
    } catch (error) {
      if (!this.socket?.connected) {
        this.connectRefCount = Math.max(0, this.connectRefCount - 1);
      }
      throw error;
    }
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
      transports: ['polling', 'websocket'],
      withCredentials: true,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.socket = socket;
    this.projectId = normalized;
    this.rejoinOnConnect = false;
    this.attachHandlers(socket);

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
        reject(new Error('协作连接超时：请确认后端已启动且 Socket.IO 可访问'));
      }, 15000);

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

    await this.scheduleJoin();
    this.rejoinOnConnect = true;
  }

  emitCursor(projectId: string, x: number, y: number, visible = true) {
    const normalized = projectId.trim();
    if (!normalized || !this.socket) return;

    if (this.projectId !== normalized) {
      this.pendingCursor = { projectId: normalized, x, y, visible };
      void this.switchProject(normalized);
      return;
    }

    if (!this.isReadyForProject(normalized)) {
      this.pendingCursor = { projectId: normalized, x, y, visible };
      return;
    }

    this.pendingCursor = null;
    this.socket.emit('collab:cursor', { projectId: normalized, x, y, visible });
  }

  emitViewport(projectId: string, panX: number, panY: number, zoom: number) {
    if (!this.isReadyForProject(projectId) || !this.socket) return;
    this.socket.emit('collab:viewport', { projectId, panX, panY, zoom });
  }

  emitSelection(
    projectId: string,
    selection: Partial<
      Omit<
        CollaborationSelectionState,
        'peerId' | 'userId' | 'name' | 'color' | 'lastSeen'
      >
    >,
  ) {
    if (!this.isReadyForProject(projectId) || !this.socket) return;

    this.localSelection = {
      imageIds:
        selection.imageIds !== undefined
          ? selection.imageIds
          : this.localSelection.imageIds,
      modelIds:
        selection.modelIds !== undefined
          ? selection.modelIds
          : this.localSelection.modelIds,
      videoIds:
        selection.videoIds !== undefined
          ? selection.videoIds
          : this.localSelection.videoIds,
      textIds:
        selection.textIds !== undefined
          ? selection.textIds
          : this.localSelection.textIds,
      pathBounds:
        selection.pathBounds !== undefined
          ? selection.pathBounds
          : this.localSelection.pathBounds,
      marqueeBounds:
        selection.marqueeBounds !== undefined
          ? selection.marqueeBounds
          : this.localSelection.marqueeBounds,
      flowNodeIds:
        selection.flowNodeIds !== undefined
          ? selection.flowNodeIds
          : this.localSelection.flowNodeIds,
    };

    this.socket.emit('collab:selection', { projectId, ...this.localSelection });
  }

  emitContentUpdate(
    projectId: string,
    payload: Omit<CollaborationContentUpdatePayload, 'peerId' | 'userId'>,
  ) {
    if (!this.isReadyForProject(projectId) || !this.socket) return;
    this.socket.emit('collab:content-update', { projectId, ...payload });
  }

  emitFlowPatch(projectId: string, patch: FlowPatchPayload) {
    if (!this.isReadyForProject(projectId) || !this.socket) return;
    this.socket.emit('collab:flow-patch', { projectId, patch });
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
    this.lastJoinedProjectId = null;
    this.pendingCursor = null;
    this.joinChain = Promise.resolve();
    this.localSelection = {
      imageIds: [],
      modelIds: [],
      videoIds: [],
      textIds: [],
      pathBounds: [],
      marqueeBounds: null,
      flowNodeIds: [],
    };
    this.peers.clear();
    this.viewports.clear();
    this.selections.clear();
    this.notifyPeers();
    this.notifyViewports();
    this.notifySelections();
    this.emitConnectionState();
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
