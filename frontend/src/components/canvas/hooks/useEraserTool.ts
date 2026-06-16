/**
 * 橡皮擦工具Hook
 * 圆形橡皮擦：按半径擦除位图笔刷与矢量路径内容
 */

import { useCallback } from 'react';
import paper from 'paper';
import { logger } from '@/utils/logger';
import type { DrawingContext } from '@/types/canvas';
import {
  eraseRastersAlongPath,
  eraseRastersAtPoint,
  eraseRastersBetweenPoints,
  getEraserRadius as computeEraserRadius,
} from '@/utils/rasterEraser';
import {
  erasePathsAtPoint,
  erasePathsBetweenPoints,
  erasePathsAlongPath,
} from '@/utils/vectorEraser';

interface UseEraserToolProps {
  context: DrawingContext;
  eraserSize: number;
}

export const useEraserTool = ({ context, eraserSize }: UseEraserToolProps) => {
  const { ensureDrawingLayer } = context;

  const getEraserRadius = useCallback(() => computeEraserRadius(eraserSize), [eraserSize]);

  const performEraseAtPoint = useCallback(
    (point: paper.Point) => {
      const drawingLayer = ensureDrawingLayer();
      if (!drawingLayer) return 0;

      const radius = getEraserRadius();
      const rasterCount = eraseRastersAtPoint(drawingLayer, point, radius);
      const pathCount = erasePathsAtPoint(drawingLayer, point, radius);
      return rasterCount + pathCount;
    },
    [ensureDrawingLayer, getEraserRadius],
  );

  const performEraseBetweenPoints = useCallback(
    (from: paper.Point, to: paper.Point) => {
      const drawingLayer = ensureDrawingLayer();
      if (!drawingLayer) return 0;

      const radius = getEraserRadius();
      const rasterCount = eraseRastersBetweenPoints(drawingLayer, from, to, radius);
      const pathCount = erasePathsBetweenPoints(drawingLayer, from, to, radius);
      return rasterCount + pathCount;
    },
    [ensureDrawingLayer, getEraserRadius],
  );

  const performErase = useCallback(
    (eraserPath: paper.Path) => {
      const drawingLayer = ensureDrawingLayer();
      if (!drawingLayer) return 0;

      const rasterCount = eraseRastersAlongPath(drawingLayer, eraserPath, eraserSize);
      const pathCount = erasePathsAlongPath(drawingLayer, eraserPath, eraserSize);
      const total = rasterCount + pathCount;
      logger.debug(`🧹 圆形橡皮擦处理了 ${total} 个图元`);
      return total;
    },
    [eraserSize, ensureDrawingLayer],
  );

  const performEraseRastersBetweenPoints = useCallback(
    (from: paper.Point, to: paper.Point) => {
      const drawingLayer = ensureDrawingLayer();
      if (!drawingLayer) return 0;

      const radius = getEraserRadius();
      return eraseRastersBetweenPoints(drawingLayer, from, to, radius);
    },
    [ensureDrawingLayer, getEraserRadius],
  );

  const performEraseRastersAtPoint = useCallback(
    (point: paper.Point) => {
      const drawingLayer = ensureDrawingLayer();
      if (!drawingLayer) return 0;

      const radius = getEraserRadius();
      return eraseRastersAtPoint(drawingLayer, point, radius);
    },
    [ensureDrawingLayer, getEraserRadius],
  );

  const performVectorEraseAtPoint = useCallback(
    (point: paper.Point) => {
      const drawingLayer = ensureDrawingLayer();
      if (!drawingLayer) return 0;

      return erasePathsAtPoint(drawingLayer, point, getEraserRadius());
    },
    [ensureDrawingLayer, getEraserRadius],
  );

  const performVectorEraseAlongTrail = useCallback(
    (trail: paper.Point[]) => {
      const drawingLayer = ensureDrawingLayer();
      if (!drawingLayer || trail.length === 0) return 0;

      const radius = getEraserRadius();
      const step = Math.max(1, radius * 0.35);
      const sampled: paper.Point[] = [trail[0].clone()];

      for (let i = 1; i < trail.length; i += 1) {
        const point = trail[i];
        const last = sampled[sampled.length - 1];
        if (point.getDistance(last) >= step) {
          sampled.push(point.clone());
        }
      }

      const tail = trail[trail.length - 1];
      if (tail.getDistance(sampled[sampled.length - 1]) > 0.5) {
        sampled.push(tail.clone());
      }

      if (sampled.length === 1) {
        return erasePathsAtPoint(drawingLayer, sampled[0], radius);
      }

      let affected = 0;
      for (let i = 1; i < sampled.length; i += 1) {
        affected += erasePathsBetweenPoints(
          drawingLayer,
          sampled[i - 1],
          sampled[i],
          radius,
        );
      }
      return affected;
    },
    [ensureDrawingLayer, getEraserRadius],
  );

  const hasErasableContentAt = useCallback(
    (point: paper.Point, radius?: number): boolean => {
      const drawingLayer = ensureDrawingLayer();
      if (!drawingLayer) return false;

      const checkRadius = radius || getEraserRadius();

      return drawingLayer.children.some((item) => {
        if (item instanceof paper.Path) {
          return item.segments.some(
            (segment) => segment.point.getDistance(point) <= checkRadius,
          );
        }
        if (item instanceof paper.Raster && item.bounds.contains(point)) {
          return true;
        }
        return false;
      });
    },
    [ensureDrawingLayer, getEraserRadius],
  );

  const previewEraseAt = useCallback(
    (point: paper.Point, radius?: number): number => {
      const drawingLayer = ensureDrawingLayer();
      if (!drawingLayer) return 0;

      const checkRadius = radius || getEraserRadius();
      let affectedCount = 0;

      drawingLayer.children.forEach((item) => {
        if (item instanceof paper.Path) {
          const hit = item.segments.some(
            (segment) => segment.point.getDistance(point) <= checkRadius,
          );
          if (hit) affectedCount += 1;
        }
      });

      return affectedCount;
    },
    [ensureDrawingLayer, getEraserRadius],
  );

  const performEraseInArea = useCallback(
    (bounds: paper.Rectangle): number => performEraseAtPoint(bounds.center),
    [performEraseAtPoint],
  );

  const clearDrawingLayer = useCallback((): number => {
    const drawingLayer = ensureDrawingLayer();
    if (!drawingLayer) return 0;

    const pathCount = drawingLayer.children.filter(
      (item) => item instanceof paper.Path || item instanceof paper.Raster,
    ).length;

    drawingLayer.children
      .filter((item) => item instanceof paper.Path || item instanceof paper.Raster)
      .forEach((item) => item.remove());

    logger.debug(`🧹 清空绘图图层，删除了 ${pathCount} 个图元`);
    return pathCount;
  }, [ensureDrawingLayer]);

  return {
    performErase,
    performEraseAtPoint,
    performEraseBetweenPoints,
    performEraseRastersBetweenPoints,
    performEraseRastersAtPoint,
    performVectorEraseAtPoint,
    performVectorEraseAlongTrail,
    getEraserRadius,
    hasErasableContentAt,
    previewEraseAt,
    performEraseInArea,
    clearDrawingLayer,
  };
};
