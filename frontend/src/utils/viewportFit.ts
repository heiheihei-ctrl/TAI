import paper from 'paper';
import { useCanvasStore } from '@/stores/canvasStore';
import { BoundsCalculator, type Bounds } from '@/utils/BoundsCalculator';

const toValidBounds = (value: unknown): Bounds | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
};

export const getFlowNodeBounds = (): Bounds[] => {
  const out: Bounds[] = [];
  try {
    const tanvaFlow = (window as any).tanvaFlow;
    if (!tanvaFlow?.rf) return out;

    const nodes = tanvaFlow.rf.getNodes?.() || [];
    const dpr = window.devicePixelRatio || 1;

    for (const node of nodes) {
      if (!node.position) continue;
      const nodeWidth = (node.data?.boxW ?? node.width ?? 200) * dpr;
      const nodeHeight = (node.data?.boxH ?? node.height ?? 150) * dpr;
      const worldX = node.position.x * dpr;
      const worldY = node.position.y * dpr;
      if (nodeWidth > 0 && nodeHeight > 0) {
        out.push({ x: worldX, y: worldY, width: nodeWidth, height: nodeHeight });
      }
    }
  } catch {}
  return out;
};

export const getAllContentBounds = (): Bounds[] => {
  const paperBounds = BoundsCalculator.getPaperDrawingBounds();
  const flowBounds = getFlowNodeBounds();
  return [...paperBounds, ...flowBounds];
};

export const getViewMetrics = () => {
  const view = paper?.view;
  if (!view || !view.viewSize) return null;
  const { width, height } = view.viewSize;
  if (!width || !height) return null;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return {
    width,
    height,
    centerX: width / 2,
    centerY: height / 2,
    dpr,
  };
};

const boundsIntersect = (a: Bounds, b: Bounds): boolean =>
  !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );

export const isViewportShowingContent = (): boolean => {
  try {
    const viewBounds = paper?.view?.bounds;
    if (!viewBounds) return true;

    const visible: Bounds = {
      x: viewBounds.x,
      y: viewBounds.y,
      width: viewBounds.width,
      height: viewBounds.height,
    };

    const contentBounds = getAllContentBounds();
    if (contentBounds.length === 0) return true;

    return contentBounds.some((bounds) => boundsIntersect(visible, bounds));
  } catch {
    return true;
  }
};

export const fitBoundsToView = (
  bounds: Bounds[],
  options?: { fallbackToCenter?: boolean }
): boolean => {
  const metrics = getViewMetrics();
  if (!metrics) return false;

  const { setZoom, setPan } = useCanvasStore.getState();

  if (bounds.length === 0) {
    if (options?.fallbackToCenter) {
      setZoom(1.0);
      setPan(metrics.centerX, metrics.centerY);
    }
    return false;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of bounds) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const contentCenterX = minX + contentWidth / 2;
  const contentCenterY = minY + contentHeight / 2;

  const padding = 40 * metrics.dpr;
  const availableWidth = Math.max(1, metrics.width - padding * 2);
  const availableHeight = Math.max(1, metrics.height - padding * 2);

  const scaleX = availableWidth / contentWidth;
  const scaleY = availableHeight / contentHeight;
  let newZoom = Math.min(scaleX, scaleY);
  newZoom = Math.max(0.1, Math.min(4, newZoom));

  const newPanX = metrics.centerX / newZoom - contentCenterX;
  const newPanY = metrics.centerY / newZoom - contentCenterY;

  setZoom(newZoom);
  setPan(newPanX, newPanY);
  return true;
};

export const fitAllContentToView = (): boolean =>
  fitBoundsToView(getAllContentBounds(), { fallbackToCenter: true });

export const clampWorldPointToContentBounds = (
  worldX: number,
  worldY: number,
  paddingRatio = 0.15
): { x: number; y: number } => {
  const bounds = getAllContentBounds();
  if (bounds.length === 0) return { x: worldX, y: worldY };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of bounds) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  const padX = Math.max(40, (maxX - minX) * paddingRatio);
  const padY = Math.max(40, (maxY - minY) * paddingRatio);

  return {
    x: Math.max(minX - padX, Math.min(maxX + padX, worldX)),
    y: Math.max(minY - padY, Math.min(maxY + padY, worldY)),
  };
};

export const ensureViewportShowsContent = (): boolean => {
  if (isViewportShowingContent()) return false;
  return fitAllContentToView();
};
