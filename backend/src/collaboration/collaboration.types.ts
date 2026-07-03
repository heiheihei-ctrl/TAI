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
