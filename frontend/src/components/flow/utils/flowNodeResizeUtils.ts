import type { Node as RFNode } from 'reactflow';
import { getFlowNodeDefaultSize } from '@/components/flow/constants/flowNodeDefaults';

export type FlowResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

export type FlowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FlowNodeResizeSnapshot = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  widthKey: string;
  heightKey: string | null;
  heightRatio: number | null;
  minWidth: number;
  minHeight: number;
};

const IMAGE_WIDTH_NODE_TYPES = new Set(['generatePro', 'generatePro4', 'imagePro']);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const getNodeRenderSize = (node: RFNode): { width: number; height: number } => {
  const fallback = getFlowNodeDefaultSize(node.type as string);
  const styleW = Number((node as RFNode & { style?: { width?: number } })?.style?.width);
  const styleH = Number((node as RFNode & { style?: { height?: number } })?.style?.height);
  const data = (node.data || {}) as Record<string, unknown>;

  const width = Number(
    node.width ??
      data.boxW ??
      data.boxWidth ??
      data.imageWidth ??
      (Number.isFinite(styleW) ? styleW : undefined) ??
      fallback.w,
  );
  const height = Number(
    node.height ??
      data.boxH ??
      data.boxHeight ??
      (typeof data.imageWidth === 'number' ? Number(data.imageWidth) * 0.75 : undefined) ??
      (Number.isFinite(styleH) ? styleH : undefined) ??
      fallback.h,
  );

  return {
    width: Number.isFinite(width) && width > 0 ? width : fallback.w,
    height: Number.isFinite(height) && height > 0 ? height : fallback.h,
  };
};

export const resolveNodeResizeSnapshot = (node: RFNode): FlowNodeResizeSnapshot => {
  const { width, height } = getNodeRenderSize(node);
  const type = String(node.type || '');
  const defaults = getFlowNodeDefaultSize(type);

  if (type === 'textPromptPro') {
    return {
      id: node.id,
      x: Number(node.position?.x ?? 0),
      y: Number(node.position?.y ?? 0),
      width,
      height,
      widthKey: 'boxWidth',
      heightKey: 'boxHeight',
      heightRatio: null,
      minWidth: 180,
      minHeight: 120,
    };
  }

  if (IMAGE_WIDTH_NODE_TYPES.has(type)) {
    return {
      id: node.id,
      x: Number(node.position?.x ?? 0),
      y: Number(node.position?.y ?? 0),
      width,
      height,
      widthKey: 'imageWidth',
      heightKey: null,
      heightRatio: 0.75,
      minWidth: 120,
      minHeight: 90,
    };
  }

  return {
    id: node.id,
    x: Number(node.position?.x ?? 0),
    y: Number(node.position?.y ?? 0),
    width,
    height,
    widthKey: 'boxW',
    heightKey: 'boxH',
    heightRatio: null,
    minWidth: Math.min(defaults.w, 180),
    minHeight: Math.min(defaults.h, 120),
  };
};

export const computeNodesBounds = (
  snapshots: FlowNodeResizeSnapshot[],
): FlowBounds | null => {
  if (!snapshots.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  snapshots.forEach((item) => {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};

const cornerPoint = (bounds: FlowBounds, corner: FlowResizeCorner) => {
  switch (corner) {
    case 'nw':
      return { x: bounds.x, y: bounds.y };
    case 'ne':
      return { x: bounds.x + bounds.width, y: bounds.y };
    case 'sw':
      return { x: bounds.x, y: bounds.y + bounds.height };
    case 'se':
    default:
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
  }
};

const anchorCornerForHandle = (corner: FlowResizeCorner): FlowResizeCorner => {
  switch (corner) {
    case 'nw':
      return 'se';
    case 'ne':
      return 'sw';
    case 'sw':
      return 'ne';
    case 'se':
    default:
      return 'nw';
  }
};

export const computeUniformScaleFromCornerDrag = (
  bounds: FlowBounds,
  corner: FlowResizeCorner,
  pointer: { x: number; y: number },
  minScale = 0.15,
  maxScale = 4,
): number => {
  const anchorCorner = anchorCornerForHandle(corner);
  const anchor = cornerPoint(bounds, anchorCorner);
  const draggedCorner = cornerPoint(bounds, corner);
  const startDist = Math.hypot(
    draggedCorner.x - anchor.x,
    draggedCorner.y - anchor.y,
  );
  const nextDist = Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y);
  if (startDist <= 0.001) return 1;
  return clamp(nextDist / startDist, minScale, maxScale);
};

export const getBoundsCenter = (bounds: FlowBounds) => ({
  x: bounds.x + bounds.width / 2,
  y: bounds.y + bounds.height / 2,
});

export const buildScaledNodePatches = (
  snapshots: FlowNodeResizeSnapshot[],
  scale: number,
  anchor: { x: number; y: number },
): Map<string, { position: { x: number; y: number }; data: Record<string, number> }> => {
  const patches = new Map<
    string,
    { position: { x: number; y: number }; data: Record<string, number> }
  >();

  snapshots.forEach((item) => {
    const nextWidth = Math.max(item.minWidth, Math.round(item.width * scale));
    const nextHeight = item.heightKey
      ? Math.max(item.minHeight, Math.round(item.height * scale))
      : item.heightRatio
      ? Math.max(item.minHeight, Math.round(nextWidth * item.heightRatio))
      : Math.max(item.minHeight, Math.round(item.height * scale));

    const nextX = anchor.x + (item.x - anchor.x) * scale;
    const nextY = anchor.y + (item.y - anchor.y) * scale;

    const data: Record<string, number> = {
      [item.widthKey]: nextWidth,
    };
    if (item.heightKey) {
      data[item.heightKey] = nextHeight;
    }

    patches.set(item.id, {
      position: { x: nextX, y: nextY },
      data,
    });
  });

  return patches;
};

export const applyScaleToNodes = (
  nodes: RFNode[],
  snapshots: FlowNodeResizeSnapshot[],
  scale: number,
  anchor: { x: number; y: number },
): RFNode[] => {
  const patches = buildScaledNodePatches(snapshots, scale, anchor);
  if (!patches.size) return nodes;

  return nodes.map((node) => {
    const patch = patches.get(node.id);
    if (!patch) return node;
    return {
      ...node,
      position: patch.position,
      data: {
        ...(node.data || {}),
        ...patch.data,
      },
    };
  });
};
