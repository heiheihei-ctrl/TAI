import paper from 'paper';
import { applyEraserMaskToLayer, getEraserRadius } from '@/utils/rasterEraser';
import { pressureToStrokeMultiplier } from '@/utils/tabletPointer';

const CANVAS_PADDING = 64;

type StrokeBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type RasterWithBlend = paper.Raster & {
  globalCompositeOperation?: string;
  blendMode?: string;
};

/**
 * 橡皮擦笔画：与位图笔刷相同的一次 stroke 会话，预览层用 destination-out，落笔时一次性应用到目标位图。
 */
export class BitmapEraserStroke {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bounds: StrokeBounds;
  private lastPoint: paper.Point | null = null;
  private distanceSinceLastStamp = 0;
  private previewRaster: paper.Raster | null = null;
  private trail: paper.Point[] = [];
  private previewLayer: paper.Layer | null = null;
  private pendingPoint: paper.Point | null = null;
  private pendingPressure = 0.5;
  private needsPaint = false;
  private paintRafId: number | null = null;

  constructor(private readonly eraserSize: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1;
    this.canvas.height = 1;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create eraser stroke canvas');
    }
    this.ctx = ctx;
    this.bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
  }

  getTrail(): paper.Point[] {
    return this.trail.map((point) => point.clone());
  }

  private getRadius(pressure = 0.5): number {
    const base = getEraserRadius(this.eraserSize);
    return Math.max(4, base * pressureToStrokeMultiplier(pressure, 0.75, 1));
  }

  private getSpacing(radius: number): number {
    return Math.max(2, radius * 0.5);
  }

  private expandBounds(x: number, y: number, radius: number) {
    const nextBounds = {
      minX: Math.min(this.bounds.minX, x - radius),
      minY: Math.min(this.bounds.minY, y - radius),
      maxX: Math.max(this.bounds.maxX, x + radius),
      maxY: Math.max(this.bounds.maxY, y + radius),
    };

    if (
      nextBounds.minX === this.bounds.minX &&
      nextBounds.minY === this.bounds.minY &&
      nextBounds.maxX === this.bounds.maxX &&
      nextBounds.maxY === this.bounds.maxY
    ) {
      return;
    }

    const paddedBounds = {
      minX: Math.floor(nextBounds.minX) - CANVAS_PADDING,
      minY: Math.floor(nextBounds.minY) - CANVAS_PADDING,
      maxX: Math.ceil(nextBounds.maxX) + CANVAS_PADDING,
      maxY: Math.ceil(nextBounds.maxY) + CANVAS_PADDING,
    };

    const nextWidth = Math.max(1, paddedBounds.maxX - paddedBounds.minX);
    const nextHeight = Math.max(1, paddedBounds.maxY - paddedBounds.minY);
    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = nextWidth;
    nextCanvas.height = nextHeight;
    const nextCtx = nextCanvas.getContext('2d');
    if (!nextCtx) return;

    if (Number.isFinite(this.bounds.minX)) {
      const offsetX = this.bounds.minX - paddedBounds.minX;
      const offsetY = this.bounds.minY - paddedBounds.minY;
      nextCtx.drawImage(this.canvas, offsetX, offsetY);
    }

    this.canvas = nextCanvas;
    this.ctx = nextCtx;
    this.bounds = paddedBounds;
  }

  private toCanvasPoint(point: paper.Point): paper.Point {
    return new paper.Point(
      point.x - this.bounds.minX,
      point.y - this.bounds.minY,
    );
  }

  private paintStamp(point: paper.Point, pressure = 0.5) {
    const radius = this.getRadius(pressure);
    this.expandBounds(point.x, point.y, radius);

    const canvasPoint = this.toCanvasPoint(point);
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#000000';
    this.ctx.globalAlpha = 1;
    this.ctx.beginPath();
    this.ctx.arc(canvasPoint.x, canvasPoint.y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  private syncPreviewRaster(layer: paper.Layer) {
    const center = new paper.Point(
      this.bounds.minX + this.canvas.width / 2,
      this.bounds.minY + this.canvas.height / 2,
    );

    if (!this.previewRaster) {
      this.previewRaster = new paper.Raster(this.canvas);
      this.previewRaster.position = center;
      const preview = this.previewRaster as RasterWithBlend;
      preview.globalCompositeOperation = 'destination-out';
      preview.blendMode = 'destination-out';
      this.previewRaster.data = {
        type: 'eraser-preview',
        isEraserPreview: true,
        sourceCanvas: this.canvas,
        projectOriginX: this.bounds.minX,
        projectOriginY: this.bounds.minY,
      };
      layer.addChild(this.previewRaster);
      return;
    }

    (this.previewRaster as RasterWithBlend).canvas = this.canvas;
    this.previewRaster.image = this.canvas;
    this.previewRaster.position = center;
    this.previewRaster.data = {
      ...(this.previewRaster.data ?? {}),
      sourceCanvas: this.canvas,
      projectOriginX: this.bounds.minX,
      projectOriginY: this.bounds.minY,
    };
  }

  private stampSegment(point: paper.Point, pressure = 0.5, layer?: paper.Layer) {
    this.trail.push(point.clone());

    if (!this.lastPoint) {
      this.paintStamp(point, pressure);
      this.lastPoint = point.clone();
      if (layer) {
        this.previewLayer = layer;
        this.syncPreviewRaster(layer);
      }
      return;
    }

    const radius = this.getRadius(pressure);
    const spacing = this.getSpacing(radius);
    const delta = point.subtract(this.lastPoint);
    const segmentLength = delta.length;
    if (segmentLength === 0) {
      return;
    }

    const direction = delta.normalize();
    let traveled = this.distanceSinceLastStamp;

    while (traveled < segmentLength) {
      const stampPoint = this.lastPoint.add(direction.multiply(traveled));
      this.paintStamp(stampPoint, pressure);
      traveled += spacing;
    }

    this.distanceSinceLastStamp = traveled - segmentLength;
    this.lastPoint = point.clone();

    const targetLayer = layer ?? this.previewLayer;
    if (targetLayer) {
      this.previewLayer = targetLayer;
      this.syncPreviewRaster(targetLayer);
    }
  }

  private schedulePaintFlush() {
    if (this.paintRafId !== null) return;
    this.paintRafId = requestAnimationFrame(() => {
      this.paintRafId = null;
      this.flushQueuedPaint();
    });
  }

  private flushQueuedPaint() {
    if (!this.needsPaint || !this.pendingPoint) return;

    const point = this.pendingPoint;
    const pressure = this.pendingPressure;
    const layer = this.previewLayer ?? undefined;

    this.needsPaint = false;
    this.pendingPoint = null;

    this.stampSegment(point, pressure, layer);
  }

  flushPendingPaint(layer?: paper.Layer) {
    if (this.paintRafId !== null) {
      cancelAnimationFrame(this.paintRafId);
      this.paintRafId = null;
    }
    if (layer) {
      this.previewLayer = layer;
    }
    if (this.pendingPoint) {
      this.needsPaint = true;
    }
    this.flushQueuedPaint();
  }

  /** pointerdown：立即落笔 */
  stamp(point: paper.Point, pressure = 0.5, layer?: paper.Layer) {
    this.flushPendingPaint(layer);
    this.stampSegment(point, pressure, layer);
  }

  /**
   * pointermove：只记录坐标并标记需要重绘，不直接绘制画布。
   */
  queuePoint(point: paper.Point, pressure = 0.5, layer?: paper.Layer) {
    this.pendingPoint = point.clone();
    this.pendingPressure = pressure;
    if (layer) {
      this.previewLayer = layer;
    }
    this.needsPaint = true;
    this.schedulePaintFlush();
  }

  finalize(layer: paper.Layer): number {
    this.flushPendingPaint(layer);

    try {
      this.previewRaster?.remove();
    } catch {}
    this.previewRaster = null;

    if (!Number.isFinite(this.bounds.minX) || this.trail.length === 0) {
      return 0;
    }

    const affected = applyEraserMaskToLayer(
      layer,
      this.canvas,
      this.bounds.minX,
      this.bounds.minY,
    );

    if (paper.project && (paper.project as { emit?: (name: string) => void }).emit) {
      (paper.project as { emit: (name: string) => void }).emit('change');
    }

    return affected;
  }

  cancel() {
    if (this.paintRafId !== null) {
      cancelAnimationFrame(this.paintRafId);
      this.paintRafId = null;
    }
    this.pendingPoint = null;
    this.needsPaint = false;
    try {
      this.previewRaster?.remove();
    } catch {}
    this.previewRaster = null;
    this.trail = [];
  }
}
