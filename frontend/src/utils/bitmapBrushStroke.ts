import paper from 'paper';
import type { AbrBrushPreset } from '@/types/abrBrush';
import { pressureToStrokeMultiplier } from '@/utils/tabletPointer';

const CANVAS_PADDING = 64;

type StrokeBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const parseHexColor = (color: string): { r: number; g: number; b: number } => {
  const normalized = color.trim();
  if (!normalized.startsWith('#')) {
    return { r: 0, g: 0, b: 0 };
  }
  const hex = normalized.slice(1);
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (hex.length >= 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return { r: 0, g: 0, b: 0 };
};

const createTintedStampCanvas = (
  preset: AbrBrushPreset,
  color: string,
): HTMLCanvasElement => {
  const { width, height, alpha } = preset.sample;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const rgb = parseHexColor(color);
  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < alpha.length; i++) {
    const offset = i * 4;
    imageData.data[offset] = rgb.r;
    imageData.data[offset + 1] = rgb.g;
    imageData.data[offset + 2] = rgb.b;
    imageData.data[offset + 3] = alpha[i];
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

export class BitmapBrushStroke {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bounds: StrokeBounds;
  private lastPoint: paper.Point | null = null;
  private distanceSinceLastStamp = 0;
  private previewRaster: paper.Raster | null = null;
  private stampCanvas: HTMLCanvasElement;

  constructor(
    private readonly preset: AbrBrushPreset,
    private readonly color: string,
    private readonly sizeScale: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1;
    this.canvas.height = 1;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create brush stroke canvas');
    }
    this.ctx = ctx;
    this.bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    this.stampCanvas = createTintedStampCanvas(preset, color);
  }

  private getDiameter(pressure = 0.5): number {
    const multiplier = pressureToStrokeMultiplier(pressure);
    return Math.max(
      4,
      this.preset.baseSize * (this.sizeScale / 4) * multiplier,
    );
  }

  private getSpacing(diameter: number): number {
    return Math.max(1, diameter * this.preset.spacing);
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
    const diameter = this.getDiameter(pressure);
    const radius = diameter / 2;
    this.expandBounds(point.x, point.y, radius);

    const canvasPoint = this.toCanvasPoint(point);
    const { width, height } = this.preset.sample;
    const scale = diameter / Math.max(width, height);
    const alpha = Math.min(
      1,
      this.preset.opacity * this.preset.flow * pressureToStrokeMultiplier(pressure, 0.35, 1),
    );

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.translate(canvasPoint.x, canvasPoint.y);
    this.ctx.rotate((this.preset.angle * Math.PI) / 180);
    this.ctx.scale(scale, scale * this.preset.roundness);
    this.ctx.drawImage(this.stampCanvas, -width / 2, -height / 2);
    this.ctx.restore();
  }

  private updatePreviewRaster(layer: paper.Layer) {
    const center = new paper.Point(
      this.bounds.minX + this.canvas.width / 2,
      this.bounds.minY + this.canvas.height / 2,
    );

    if (!this.previewRaster) {
      this.previewRaster = new paper.Raster(this.canvas);
      this.previewRaster.position = center;
      this.previewRaster.data = {
        type: 'abr-brush-preview',
        brushId: this.preset.id,
      };
      layer.addChild(this.previewRaster);
      return;
    }

    this.previewRaster.image = this.canvas;
    this.previewRaster.position = center;
  }

  stamp(point: paper.Point, pressure = 0.5, layer?: paper.Layer) {
    if (!this.lastPoint) {
      this.paintStamp(point, pressure);
      this.lastPoint = point.clone();
      if (layer) this.updatePreviewRaster(layer);
      return;
    }

    const spacing = this.getSpacing(this.getDiameter(pressure));
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

    if (layer) {
      this.updatePreviewRaster(layer);
    }
  }

  finalize(layer: paper.Layer): paper.Raster {
    if (this.previewRaster) {
      this.previewRaster.data = {
        type: 'abr-brush-stroke',
        brushId: this.preset.id,
        brushName: this.preset.name,
      };
      if (paper.project && (paper.project as any).emit) {
        (paper.project as any).emit('change');
      }
      const raster = this.previewRaster;
      this.previewRaster = null;
      return raster;
    }

    const raster = new paper.Raster(this.canvas);
    raster.position = new paper.Point(
      this.bounds.minX + this.canvas.width / 2,
      this.bounds.minY + this.canvas.height / 2,
    );
    raster.data = {
      type: 'abr-brush-stroke',
      brushId: this.preset.id,
      brushName: this.preset.name,
    };
    layer.addChild(raster);
    return raster;
  }

  cancel() {
    try {
      this.previewRaster?.remove();
    } catch {}
    this.previewRaster = null;
  }
}
