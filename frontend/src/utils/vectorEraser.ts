import paper from 'paper';
import { getEraserRadius } from '@/utils/rasterEraser';

const NON_ERASABLE_PATH_TYPES = new Set([
  'image-placeholder',
  '3d-model-placeholder',
  'image-group',
  'eraser-preview',
]);

const isErasableVectorPath = (item: paper.Item): item is paper.Path => {
  if (!(item instanceof paper.Path)) return false;
  const type = item.data?.type as string | undefined;
  if (type && NON_ERASABLE_PATH_TYPES.has(type)) return false;
  if (item.data?.isResizeHandle || item.data?.isGuide) return false;
  return true;
};

const clonePathStyle = (source: paper.Path, target: paper.Path) => {
  target.strokeColor = source.strokeColor?.clone() ?? null;
  target.fillColor = source.fillColor?.clone() ?? null;
  target.strokeWidth = source.strokeWidth;
  target.strokeCap = source.strokeCap;
  target.strokeJoin = source.strokeJoin;
  target.opacity = source.opacity;
  target.dashArray = source.dashArray ? [...source.dashArray] : [];
  target.dashOffset = source.dashOffset;
  target.closed = source.closed;
  target.data = { ...(source.data ?? {}) };
};

const segmentWithinRadius = (
  path: paper.Path,
  segmentIndex: number,
  point: paper.Point,
  radius: number,
): boolean => {
  const segment = path.segments[segmentIndex];
  if (!segment) return false;

  const strokePadding = Math.max(0, (path.strokeWidth ?? 0) * 0.5);
  const effectiveRadius = radius + strokePadding;

  if (segment.point.getDistance(point) <= effectiveRadius) {
    return true;
  }

  const nearest = path.getNearestLocation(point);
  if (!nearest) return false;

  return nearest.distance <= effectiveRadius;
};

const splitPathByErasedSegments = (
  path: paper.Path,
  erasedFlags: boolean[],
): paper.Point[][] => {
  const runs: paper.Point[][] = [];
  let current: paper.Point[] = [];

  erasedFlags.forEach((erased, index) => {
    const segmentPoint = path.segments[index]?.point;
    if (!segmentPoint) return;

    if (erased) {
      if (current.length > 0) {
        runs.push(current);
        current = [];
      }
      return;
    }

    current.push(segmentPoint.clone());
  });

  if (current.length > 0) {
    runs.push(current);
  }

  return runs;
};

export const erasePathsAtPoint = (
  layer: paper.Layer,
  point: paper.Point,
  radius: number,
): number => {
  const toRemove: paper.Item[] = [];
  const toAdd: paper.Path[] = [];

  layer.children.slice().forEach((item) => {
    if (!isErasableVectorPath(item)) return;
    if (item.segments.length === 0) return;

    const erasedFlags = item.segments.map((_, index) =>
      segmentWithinRadius(item, index, point, radius),
    );

    if (!erasedFlags.some(Boolean)) {
      return;
    }

    if (erasedFlags.every(Boolean)) {
      toRemove.push(item);
      return;
    }

    const runs = splitPathByErasedSegments(item, erasedFlags);
    toRemove.push(item);

    runs.forEach((run) => {
      if (run.length < 2) return;
      const nextPath = new paper.Path(run);
      clonePathStyle(item, nextPath);
      toAdd.push(nextPath);
    });
  });

  toRemove.forEach((item) => {
    try {
      item.remove();
    } catch {}
  });
  toAdd.forEach((path) => layer.addChild(path));

  if (toRemove.length > 0 || toAdd.length > 0) {
    paper.view?.update();
  }

  return toRemove.length + toAdd.length;
};

export const erasePathsBetweenPoints = (
  layer: paper.Layer,
  from: paper.Point,
  to: paper.Point,
  radius: number,
): number => {
  const distance = from.getDistance(to);
  const step = Math.max(1, radius * 0.35);
  if (distance === 0) {
    return erasePathsAtPoint(layer, to, radius);
  }

  const direction = to.subtract(from).normalize();
  let affected = 0;
  for (let traveled = 0; traveled <= distance; traveled += step) {
    affected += erasePathsAtPoint(
      layer,
      from.add(direction.multiply(traveled)),
      radius,
    );
  }
  return affected;
};

export const erasePathsAlongPath = (
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
        affected += erasePathsAtPoint(layer, point, radius);
      }
    }
    return affected;
  }

  let affected = 0;
  eraserPath.segments.forEach((segment) => {
    affected += erasePathsAtPoint(layer, segment.point, radius);
  });
  return affected;
};
