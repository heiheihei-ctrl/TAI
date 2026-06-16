import type { ImageAssetSnapshot, ModelAssetSnapshot, TextAssetSnapshot, VideoAssetSnapshot } from '@/types/project';
import type { TemplateEdge, TemplateNode } from '@/types/template';
import {
  CANVAS_CLIPBOARD_STORAGE_KEY,
  normalizeCanvasClipboardForStorage,
} from '@/utils/canvasClipboard';

export type ClipboardZone = 'canvas' | 'flow';

export interface PathClipboardSnapshot {
  json: any;
  layerName?: string;
  position: { x: number; y: number };
  bounds?: { x: number; y: number; width: number; height: number };
  strokeWidth?: number;
  strokeColor?: string;
  fillColor?: string;
}

export interface CanvasClipboardData {
  images: ImageAssetSnapshot[];
  models: ModelAssetSnapshot[];
  texts: TextAssetSnapshot[];
  videos: VideoAssetSnapshot[];
  paths: PathClipboardSnapshot[];
  /** 复制时选中内容的左上角，用于粘贴定位 */
  origin?: { x: number; y: number };
}

export interface ClipboardFlowNode extends TemplateNode {
  width?: number;
  height?: number;
  style?: Record<string, unknown>;
}

export interface FlowClipboardData {
  nodes: ClipboardFlowNode[];
  edges: TemplateEdge[];
  linkedEdges?: TemplateEdge[];
  origin: { x: number; y: number };
}

class ClipboardService {
  private canvasPayload: { data: CanvasClipboardData; timestamp: number } | null = null;
  private flowPayload: { data: FlowClipboardData; timestamp: number } | null = null;
  private activeZone: ClipboardZone | null = null;

  setCanvasData(data: CanvasClipboardData) {
    const normalized = normalizeCanvasClipboardForStorage(data);
    const timestamp = Date.now();
    this.canvasPayload = { data: normalized, timestamp };
    this.activeZone = 'canvas';
    try {
      sessionStorage.setItem(
        CANVAS_CLIPBOARD_STORAGE_KEY,
        JSON.stringify({ data: normalized, timestamp }),
      );
    } catch {}
  }

  setFlowData(data: FlowClipboardData) {
    this.flowPayload = { data, timestamp: Date.now() };
    this.activeZone = 'flow';
  }

  getCanvasData(): CanvasClipboardData | null {
    if (this.canvasPayload?.data) {
      return this.canvasPayload.data;
    }

    try {
      const raw = sessionStorage.getItem(CANVAS_CLIPBOARD_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        data?: CanvasClipboardData;
        timestamp?: number;
      };
      if (!parsed?.data) return null;
      this.canvasPayload = {
        data: parsed.data,
        timestamp: parsed.timestamp ?? Date.now(),
      };
      return parsed.data;
    } catch {
      return null;
    }
  }

  getFlowData(): FlowClipboardData | null {
    return this.flowPayload?.data ?? null;
  }

  getZone(): ClipboardZone | null {
    if (this.activeZone) return this.activeZone;
    const canvasTs = this.canvasPayload?.timestamp ?? 0;
    const flowTs = this.flowPayload?.timestamp ?? 0;
    if (!canvasTs && !flowTs) return null;
    return canvasTs >= flowTs ? 'canvas' : 'flow';
  }

  setActiveZone(zone: ClipboardZone | null) {
    this.activeZone = zone;
  }

  clear() {
    this.canvasPayload = null;
    this.flowPayload = null;
    this.activeZone = null;
    try {
      sessionStorage.removeItem(CANVAS_CLIPBOARD_STORAGE_KEY);
    } catch {}
  }

  clearCanvas() {
    this.canvasPayload = null;
    if (this.activeZone === 'canvas') {
      this.activeZone = null;
    }
    try {
      sessionStorage.removeItem(CANVAS_CLIPBOARD_STORAGE_KEY);
    } catch {}
  }
}

export const clipboardService = new ClipboardService();
