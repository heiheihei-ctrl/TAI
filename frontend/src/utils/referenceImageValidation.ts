import { REFERENCE_IMAGE_MAX_SIZE } from '@/services/imageUploadService';
import {
  blobToDataUrl,
  canvasToBlob,
  createImageBitmapLimited,
} from '@/utils/imageConcurrency';
import { resolveImageToBlob } from '@/utils/imageSource';

export { REFERENCE_IMAGE_MAX_SIZE };

export function formatReferenceImageSizeError(bytes: number, label = '参考图'): string {
  return `${label}单张过大，请选择小于 10MB 的图片，当前约 ${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function assertReferenceImageBytesWithinLimit(bytes: number, label = '参考图'): void {
  if (!Number.isFinite(bytes) || bytes <= REFERENCE_IMAGE_MAX_SIZE) return;
  throw new Error(formatReferenceImageSizeError(bytes, label));
}

/**
 * 估算 data URL 的二进制体积（单张）。
 * 若误把多张 data URL 拼成一个字符串，只计量第一张，避免「合计」误报。
 */
export function estimateDataUrlByteLength(value: string): number | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed.startsWith('data:')) return undefined;
  const commaIndex = trimmed.indexOf(',');
  if (commaIndex < 0) return undefined;
  let payload = trimmed.slice(commaIndex + 1).trim();
  if (!payload) return 0;

  // 防御多图被 join / toString 拼进同一个 data URL
  const embeddedNext = payload.search(/,\s*data:image\//i);
  if (embeddedNext >= 0) {
    payload = payload.slice(0, embeddedNext).trim();
  }

  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

function isReferenceImageSizeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes('单张过大') ||
    msg.includes('文件过大') ||
    msg.includes('10MB') ||
    msg.includes('ToAPIs')
  );
}

/** 以真实 Blob.size 计量单张体积；禁止用字符串 length / 多图合计 */
export async function measureReferenceImageBytes(
  input: string,
): Promise<number | undefined> {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) return undefined;

  try {
    const blob = await resolveImageToBlob(trimmed, { preferProxy: true });
    if (blob && Number.isFinite(blob.size) && blob.size > 0) {
      return blob.size;
    }
  } catch (error) {
    if (isReferenceImageSizeError(error)) throw error;
  }

  if (trimmed.startsWith('data:')) {
    return estimateDataUrlByteLength(trimmed);
  }

  // HEAD 仅作兜底；Content-Length 可能缺失或不可靠
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const response = await fetch(trimmed, { method: 'HEAD' });
      const contentLength = response.headers.get('content-length');
      if (!contentLength) return undefined;
      const bytes = Number.parseInt(contentLength, 10);
      return Number.isFinite(bytes) && bytes > 0 ? bytes : undefined;
    } catch (error) {
      if (isReferenceImageSizeError(error)) throw error;
    }
  }

  return undefined;
}

async function compressBlobUnderLimit(
  source: Blob,
  maxBytes: number,
): Promise<Blob | null> {
  if (!source || source.size <= maxBytes) return source;

  const qualities = [0.92, 0.84, 0.76, 0.68, 0.58, 0.48];
  const scales = [1, 0.92, 0.84, 0.75, 0.65, 0.55];

  let bitmap: ImageBitmap | null = null;
  try {
    if (typeof createImageBitmap !== 'function') return null;
    bitmap = await createImageBitmapLimited(source);
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (!srcW || !srcH) return null;

    for (const scale of scales) {
      const outW = Math.max(1, Math.round(srcW * scale));
      const outH = Math.max(1, Math.round(srcH * scale));
      const canvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(outW, outH)
          : document.createElement('canvas');
      if (canvas instanceof HTMLCanvasElement) {
        canvas.width = outW;
        canvas.height = outH;
      }
      const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext(
        '2d',
      ) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) continue;
      try {
        ctx.imageSmoothingEnabled = true;
      } catch {
        // ignore
      }
      ctx.drawImage(bitmap, 0, 0, outW, outH);

      for (const quality of qualities) {
        const blob = await canvasToBlob(canvas, {
          type: 'image/jpeg',
          quality,
        });
        if (blob.size > 0 && blob.size <= maxBytes) {
          return blob;
        }
      }
    }
  } catch {
    return null;
  } finally {
    try {
      bitmap?.close();
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * 若单张略超 10MB（常见于 canvas PNG 重编码膨胀），自动压到上限内并返回可用引用。
 * 多图不会合计；每张独立处理。
 */
export async function ensureReferenceImageWithinLimit(
  input: string,
  label = '参考图',
): Promise<string> {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) return trimmed;

  const bytes = await measureReferenceImageBytes(trimmed);
  if (typeof bytes !== 'number' || bytes <= REFERENCE_IMAGE_MAX_SIZE) {
    return trimmed;
  }

  const sourceBlob = await resolveImageToBlob(trimmed, { preferProxy: true });
  if (!sourceBlob) {
    assertReferenceImageBytesWithinLimit(bytes, label);
    return trimmed;
  }

  const compressed = await compressBlobUnderLimit(
    sourceBlob,
    REFERENCE_IMAGE_MAX_SIZE,
  );
  if (!compressed || compressed.size > REFERENCE_IMAGE_MAX_SIZE) {
    assertReferenceImageBytesWithinLimit(
      compressed?.size ?? bytes,
      label,
    );
    return trimmed;
  }

  return await blobToDataUrl(compressed);
}

/** 逐张校验参考图体积（单张 ≤10MB），超限直接抛错，避免无效请求发到 ToAPIs */
export async function validateReferenceImageInput(
  input: string,
  label = '参考图',
): Promise<void> {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) return;

  const bytes = await measureReferenceImageBytes(trimmed);
  if (typeof bytes === 'number') {
    assertReferenceImageBytesWithinLimit(bytes, label);
  }
}

export async function validateReferenceImageInputs(
  inputs: string[],
  label = '参考图',
): Promise<void> {
  const list = Array.isArray(inputs) ? inputs : [];
  for (let i = 0; i < list.length; i++) {
    // 多图时标序号，避免被误解成「多图合计」超限
    const itemLabel = list.length > 1 ? `${label}${i + 1}` : label;
    await validateReferenceImageInput(list[i], itemLabel);
  }
}

/** 逐张确保 ≤10MB（必要时压缩）；返回与输入等长的可用引用列表 */
export async function ensureReferenceImagesWithinLimit(
  inputs: string[],
  label = '参考图',
): Promise<string[]> {
  const list = Array.isArray(inputs) ? inputs : [];
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const itemLabel = list.length > 1 ? `${label}${i + 1}` : label;
    const next = await ensureReferenceImageWithinLimit(list[i], itemLabel);
    if (next) out.push(next);
  }
  return out;
}
