export interface CollaborationPeer {
  peerId: string;
  userId: string;
  name: string;
  color: string;
  x?: number;
  y?: number;
  visible?: boolean;
  viewport?: CollaborationViewportPayload;
  selection?: CollaborationSelectionPayload;
}

export interface CollaborationUserPayload {
  sub: string;
  id: string;
  name?: string | null;
  phone?: string | null;
}

export interface CollaborationViewportPayload {
  panX: number;
  panY: number;
  zoom: number;
}

export interface CollaborationBoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollaborationSelectionPayload {
  imageIds: string[];
  modelIds: string[];
  videoIds: string[];
  textIds: string[];
  pathBounds: CollaborationBoundsRect[];
  marqueeBounds?: CollaborationBoundsRect | null;
  /** Flow 画布节点选中（用于协同独占锁） */
  flowNodeIds: string[];
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

/** Flow 节点/连线协作 patch（与 Tanva NodePatchPayload 同结构） */
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
