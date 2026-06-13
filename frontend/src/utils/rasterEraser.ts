import paper from 'paper';

const ERASABLE_RASTER_TYPES = new Set(['abr-brush-stroke', 'abr-brush-preview']);

export const getEraserRadius = (strokeWidth: number): number => strokeWidth * 1.5;

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
  const image = raster.image as HTMLCanvasElement | HTMLImageElement | undefined;
  if (!image) return null;

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
    raster.image = canvas;
    return canvas;
  }

  return null;
};

const isErasableRaster = (item: paper.Item): item is paper.Raster =>
  item instanceof paper.Raster &&
  ERASABLE_RASTER_TYPES.has(item.data?.type as string);

export const eraseRastersAtPoint = (
  layer: paper.Layer,
  point: paper.Point,
  radius: number,
): number => {
  const diameter = radius * 2;
  const stampBounds = new paper.Rectangle(
    point.x - radius,
    point.y - radius,
    diameter,
    diameter,
  );

  let affected = 0;

  layer.children.forEach((item) => {
    if (!isErasableRaster(item)) return;
    if (!item.bounds.intersects(stampBounds)) return;

    const canvas = resolveRasterCanvas(item);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const topLeft = item.bounds.topLeft;
    const localX = point.x - topLeft.x;
    const localY = point.y - topLeft.y;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(localX, localY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    item.image = canvas;

    if (!rasterHasVisiblePixels(canvas)) {
      try {
        item.remove();
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
  layer: paper.Layer,
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
  layer: paper.Layer,
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
