import paper from 'paper';
import { isGroup, isRaster } from '@/utils/paperCoords';

const ERASABLE_RASTER_TYPES = new Set(['abr-brush-stroke', 'abr-brush-preview']);
const SYSTEM_LAYER_NAMES = new Set(['grid', 'guides', 'layer_fallback']);

export const getEraserRadius = (strokeWidth: number): number =>
  Math.max(4, strokeWidth * 2.5);

type RasterWithCanvas = paper.Raster & {
  canvas?: HTMLCanvasElement;
};

export const isErasableRaster = (item: paper.Item): item is paper.Raster => {
  if (!isRaster(item)) return false;

  const type = item.data?.type as string | undefined;
  if (type && ERASABLE_RASTER_TYPES.has(type)) return true;
  if (item.data?.isAbrBrushRaster === true) return true;
  if (typeof item.data?.brushId === 'string' && item.data.brushId.length > 0) {
    return true;
  }

  return false;
};

const rasterHasVisiblePixels = (canvas: HTMLCanvasElement): boolean => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) return true;
  }
  return false;
};

const resolveRasterCanvas = (raster: paper.Raster): HTMLCanvasElement | null => {
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
  const scaleX =
    bounds.width > 0 ? canvas.width / bounds.width : 1;
  const scaleY =
    bounds.height > 0 ? canvas.height / bounds.height : 1;

  return {
    x: (point.x - origin.x) * scaleX,
    y: (point.y - origin.y) * scaleY,
    radius: Math.max(1, radius * scaleX),
  };
};

const collectErasableRasters = (): paper.Raster[] => {
  if (!paper.project) return [];

  const found = new Map<string, paper.Raster>();
  const add = (item: paper.Item) => {
    if (!isErasableRaster(item)) return;
    const layer = item.layer;
    if (!layer?.name || SYSTEM_LAYER_NAMES.has(layer.name)) return;
    found.set(String(item.id), item);
  };

  try {
    const RasterClass = (paper as typeof paper & { Raster?: typeof paper.Raster })
      .Raster;
    if (RasterClass) {
      (paper.project.getItems({ class: RasterClass }) as paper.Item[]).forEach(add);
    }
  } catch {}

  paper.project.layers.forEach((layer) => {
    if (!layer?.name || SYSTEM_LAYER_NAMES.has(layer.name)) return;
    const visit = (item: paper.Item) => {
      add(item);
      if (isGroup(item)) {
        item.children.forEach((child) => visit(child));
      }
    };
    layer.children.forEach((child) => visit(child));
  });

  return Array.from(found.values());
};

const refreshRasterAfterErase = (
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
    raster.setImage(canvas);
  } catch {}

  raster.changed?.();
};

export const eraseRastersAtPoint = (
  _layer: paper.Layer | null,
  point: paper.Point,
  radius: number,
): number => {
  let affected = 0;
  const stampBounds = new paper.Rectangle(
    point.x - radius,
    point.y - radius,
    radius * 2,
    radius * 2,
  );

  collectErasableRasters().forEach((raster) => {
    if (!raster.bounds.intersects(stampBounds)) {
      return;
    }

    const canvas = resolveRasterCanvas(raster);
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return;

    const local = projectPointToRasterPixels(raster, canvas, point, radius);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(local.x, local.y, local.radius, 0, Math.PI * 2);
    ctx.fill();
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

export const eraseRastersBetweenPoints = (
  layer: paper.Layer | null,
  from: paper.Point,
  to: paper.Point,
  radius: number,
): number => {
  const distance = from.getDistance(to);
  const step = Math.max(1, radius * 0.35);
  if (distance === 0) {
    return eraseRastersAtPoint(layer, to, radius);
  }

  const direction = to.subtract(from).normalize();
  let affected = 0;
  for (let traveled = 0; traveled <= distance; traveled += step) {
    affected += eraseRastersAtPoint(
      layer,
      from.add(direction.multiply(traveled)),
      radius,
    );
  }
  return affected;
};

export const eraseRastersAlongPath = (
  layer: paper.Layer | null,
  eraserPath: paper.Path,
  strokeWidth: number,
): number => {
  const radius = getEraserRadius(strokeWidth);
  const pathLength = eraserPath.length;
  if (pathLength > 0) {
    const step = Math.max(1, radius * 0.35);
    let affected = 0;
    for (let offset = 0; offset <= pathLength; offset += step) {
      const point = eraserPath.getPointAt(offset);
      if (point) {
        affected += eraseRastersAtPoint(layer, point, radius);
      }
    }
    return affected;
  }

  let affected = 0;
  eraserPath.segments.forEach((segment) => {
    affected += eraseRastersAtPoint(layer, segment.point, radius);
  });
  return affected;
};
