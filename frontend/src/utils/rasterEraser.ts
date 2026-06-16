import paper from 'paper';
import { isGroup, isRaster } from '@/utils/paperCoords';

const ERASABLE_RASTER_TYPES = new Set(['abr-brush-stroke', 'abr-brush-preview']);
const SYSTEM_LAYER_NAMES = new Set(['grid', 'guides', 'layer_fallback']);

export const getEraserRadius = (size: number): number =>
  Math.max(4, size * 2.5);

type RasterWithCanvas = paper.Raster & {
  canvas?: HTMLCanvasElement;
};

export const isErasableRaster = (item: paper.Item): item is paper.Raster => {
  if (!isRaster(item)) return false;

  if (item.data?.isEraserPreview === true) return false;
  if (item.data?.type === 'eraser-preview') return false;

  const type = item.data?.type as string | undefined;
  if (type && ERASABLE_RASTER_TYPES.has(type)) return true;
  if (item.data?.isAbrBrushRaster === true) return true;
  if (typeof item.data?.brushId === 'string' && item.data.brushId.length > 0) {
    return true;
  }

  return false;
};

export const rasterHasVisiblePixels = (canvas: HTMLCanvasElement): boolean => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 64) {
    if (data[i] > 0) return true;
  }
  return false;
};

export const resolveRasterCanvas = (raster: paper.Raster): HTMLCanvasElement | null => {
  const dataCanvas = raster.data?.sourceCanvas;
  if (dataCanvas instanceof HTMLCanvasElement) {
    return dataCanvas;
  }

  const paperCanvas = (raster as RasterWithCanvas).canvas;
  if (paperCanvas instanceof HTMLCanvasElement) {
    return paperCanvas;
  }

  const image = raster.image as HTMLCanvasElement | HTMLImageElement | undefined;
  if (image instanceof HTMLCanvasElement) {
    return image;
  }

  if (image instanceof HTMLImageElement && image.width > 0 && image.height > 0) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    bindRasterCanvas(raster, canvas);
    return canvas;
  }

  return null;
};

const bindRasterCanvas = (raster: paper.Raster, canvas: HTMLCanvasElement) => {
  (raster as RasterWithCanvas).canvas = canvas;
  raster.image = canvas;
  raster.data = {
    ...(raster.data ?? {}),
    sourceCanvas: canvas,
  };
};

const getRasterProjectOrigin = (raster: paper.Raster) => {
  const originX = raster.data?.projectOriginX;
  const originY = raster.data?.projectOriginY;
  if (typeof originX === 'number' && typeof originY === 'number') {
    return { x: originX, y: originY };
  }
  return {
    x: raster.bounds.x,
    y: raster.bounds.y,
  };
};

const projectPointToRasterPixels = (
  raster: paper.Raster,
  canvas: HTMLCanvasElement,
  point: paper.Point,
  radius: number,
) => {
  const origin = getRasterProjectOrigin(raster);
  const bounds = raster.bounds;
  const scaleX = bounds.width > 0 ? canvas.width / bounds.width : 1;
  const scaleY = bounds.height > 0 ? canvas.height / bounds.height : 1;

  return {
    x: (point.x - origin.x) * scaleX,
    y: (point.y - origin.y) * scaleY,
    radius: Math.max(1, radius * scaleX),
  };
};

export const collectErasableRastersFromLayer = (
  layer: paper.Layer,
): paper.Raster[] => {
  const found = new Map<string, paper.Raster>();
  const visit = (item: paper.Item) => {
    if (isErasableRaster(item)) {
      found.set(String(item.id), item);
      return;
    }
    if (isGroup(item)) {
      item.children.forEach((child) => visit(child));
    }
  };

  layer.children.forEach((child) => visit(child));
  return Array.from(found.values());
};

const collectErasableRasters = (layer?: paper.Layer | null): paper.Raster[] => {
  if (layer) {
    return collectErasableRastersFromLayer(layer);
  }

  if (!paper.project) return [];

  const found = new Map<string, paper.Raster>();
  paper.project.layers.forEach((projectLayer) => {
    if (!projectLayer?.name || SYSTEM_LAYER_NAMES.has(projectLayer.name)) return;
    collectErasableRastersFromLayer(projectLayer).forEach((raster) => {
      found.set(String(raster.id), raster);
    });
  });

  return Array.from(found.values());
};

export const refreshRasterAfterErase = (
  raster: paper.Raster,
  canvas: HTMLCanvasElement,
) => {
  bindRasterCanvas(raster, canvas);

  const origin = getRasterProjectOrigin(raster);
  raster.position = new paper.Point(
    origin.x + canvas.width / 2,
    origin.y + canvas.height / 2,
  );

  try {
    (raster as any).setImage?.(canvas);
  } catch {}

  (raster as any).changed?.();
};

export const buildStampPoints = (
  from: paper.Point,
  to: paper.Point,
  radius: number,
): paper.Point[] => {
  const distance = from.getDistance(to);
  const step = Math.max(2, radius * 0.5);
  if (distance === 0) {
    return [to.clone()];
  }

  const direction = to.subtract(from).normalize();
  const points: paper.Point[] = [];
  for (let traveled = 0; traveled <= distance; traveled += step) {
    points.push(from.add(direction.multiply(traveled)));
  }

  const last = points[points.length - 1];
  if (!last || last.getDistance(to) > 0.5) {
    points.push(to.clone());
  }

  return points;
};

export const buildSweepBounds = (
  points: paper.Point[],
  radius: number,
): paper.Rectangle => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach((point) => {
    minX = Math.min(minX, point.x - radius);
    minY = Math.min(minY, point.y - radius);
    maxX = Math.max(maxX, point.x + radius);
    maxY = Math.max(maxY, point.y + radius);
  });

  return new paper.Rectangle(minX, minY, maxX - minX, maxY - minY);
};

export const paintEraseStampOnRaster = (
  raster: paper.Raster,
  canvas: HTMLCanvasElement,
  point: paper.Point,
  radius: number,
) => {
  const local = projectPointToRasterPixels(raster, canvas, point, radius);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(local.x, local.y, local.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const eraseRastersWithStamps = (
  layer: paper.Layer | null,
  points: paper.Point[],
  radius: number,
  finalize = true,
): number => {
  if (points.length === 0) return 0;

  const sweepBounds = buildSweepBounds(points, radius);
  const rasters = collectErasableRasters(layer).filter((raster) =>
    raster.bounds.intersects(sweepBounds),
  );

  if (rasters.length === 0) return 0;

  let affected = 0;
  rasters.forEach((raster) => {
    const canvas = resolveRasterCanvas(raster);
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return;

    let stamped = false;
    points.forEach((point) => {
      const stampBounds = new paper.Rectangle(
        point.x - radius,
        point.y - radius,
        radius * 2,
        radius * 2,
      );
      if (!raster.bounds.intersects(stampBounds)) return;
      paintEraseStampOnRaster(raster, canvas, point, radius);
      stamped = true;
    });

    if (!stamped) return;

    if (finalize) {
      refreshRasterAfterErase(raster, canvas);
      if (!rasterHasVisiblePixels(canvas)) {
        try {
          raster.remove();
        } catch {}
      }
    } else {
      try {
        (raster as any).changed?.();
      } catch {}
    }

    affected += 1;
  });

  if (affected > 0) {
    paper.view?.update();
  }

  return affected;
};

export const applyEraserMaskToLayer = (
  layer: paper.Layer,
  maskCanvas: HTMLCanvasElement,
  originX: number,
  originY: number,
): number => {
  if (maskCanvas.width <= 0 || maskCanvas.height <= 0) return 0;

  const maskBounds = new paper.Rectangle(
    originX,
    originY,
    maskCanvas.width,
    maskCanvas.height,
  );

  const rasters = collectErasableRastersFromLayer(layer).filter((raster) =>
    raster.bounds.intersects(maskBounds),
  );

  if (rasters.length === 0) return 0;

  let affected = 0;
  rasters.forEach((raster) => {
    const canvas = resolveRasterCanvas(raster);
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return;

    const rasterOrigin = getRasterProjectOrigin(raster);
    const scaleX =
      raster.bounds.width > 0 ? canvas.width / raster.bounds.width : 1;
    const scaleY =
      raster.bounds.height > 0 ? canvas.height / raster.bounds.height : 1;

    const destX = (originX - rasterOrigin.x) * scaleX;
    const destY = (originY - rasterOrigin.y) * scaleY;
    const destW = maskCanvas.width * scaleX;
    const destH = maskCanvas.height * scaleY;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(maskCanvas, destX, destY, destW, destH);
    ctx.restore();

    refreshRasterAfterErase(raster, canvas);

    if (!rasterHasVisiblePixels(canvas)) {
      try {
        raster.remove();
      } catch {}
    }

    affected += 1;
  });

  if (affected > 0) {
    paper.view?.update();
  }

  return affected;
};

export const eraseRastersAtPoint = (
  layer: paper.Layer | null,
  point: paper.Point,
  radius: number,
): number => eraseRastersWithStamps(layer, [point], radius, true);

export const eraseRastersBetweenPoints = (
  layer: paper.Layer | null,
  from: paper.Point,
  to: paper.Point,
  radius: number,
): number => {
  const points = buildStampPoints(from, to, radius);
  return eraseRastersWithStamps(layer, points, radius, true);
};

export const eraseRastersAlongPath = (
  layer: paper.Layer | null,
  eraserPath: paper.Path,
  strokeWidth: number,
): number => {
  const radius = getEraserRadius(strokeWidth);
  const pathLength = eraserPath.length;
  if (pathLength > 0) {
    const step = Math.max(2, radius * 0.5);
    const points: paper.Point[] = [];
    for (let offset = 0; offset <= pathLength; offset += step) {
      const point = eraserPath.getPointAt(offset);
      if (point) points.push(point);
    }
    return eraseRastersWithStamps(layer, points, radius, true);
  }

  const points = eraserPath.segments.map((segment) => segment.point);
  return eraseRastersWithStamps(layer, points, radius, true);
};
