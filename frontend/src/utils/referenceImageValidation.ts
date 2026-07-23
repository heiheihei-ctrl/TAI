import { REFERENCE_IMAGE_MAX_SIZE } from '@/services/imageUploadService';
import { resolveImageToBlob } from '@/utils/imageSource';

export { REFERENCE_IMAGE_MAX_SIZE };

export function formatReferenceImageSizeError(bytes: number, label = '参考图'): string {
  return `${label}文件过大，请选择小于 10MB 的图片，当前约 ${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function assertReferenceImageBytesWithinLimit(bytes: number, label = '参考图'): void {
  if (!Number.isFinite(bytes) || bytes <= REFERENCE_IMAGE_MAX_SIZE) return;
  throw new Error(formatReferenceImageSizeError(bytes, label));
}

export function estimateDataUrlByteLength(value: string): number | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed.startsWith('data:')) return undefined;
  const commaIndex = trimmed.indexOf(',');
  if (commaIndex < 0) return undefined;
  const payload = trimmed.slice(commaIndex + 1).trim();
  if (!payload) return 0;
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

async function assertRemoteUrlWithinLimit(url: string, label: string): Promise<void> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentLength = response.headers.get('content-length');
    if (!contentLength) return;
    const bytes = Number.parseInt(contentLength, 10);
    if (Number.isFinite(bytes)) {
      assertReferenceImageBytesWithinLimit(bytes, label);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('文件过大')) {
      throw error;
    }
    // HEAD 可能被 CORS 拦截；后端仍会兜底校验
  }
}

/** 校验参考图体积，超限直接抛错，避免无效请求发到 ToAPIs */
export async function validateReferenceImageInput(
  input: string,
  label = '参考图',
): Promise<void> {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) return;

  if (trimmed.startsWith('data:')) {
    const bytes = estimateDataUrlByteLength(trimmed);
    if (typeof bytes === 'number') {
      assertReferenceImageBytesWithinLimit(bytes, label);
    }
    return;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    await assertRemoteUrlWithinLimit(trimmed, label);
    return;
  }

  const blob = await resolveImageToBlob(trimmed, { preferProxy: true });
  if (blob) {
    assertReferenceImageBytesWithinLimit(blob.size, label);
  }
}

export async function validateReferenceImageInputs(
  inputs: string[],
  label = '参考图',
): Promise<void> {
  for (const input of inputs) {
    await validateReferenceImageInput(input, label);
  }
}
