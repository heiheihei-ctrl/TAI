import type { CanvasClipboardData } from '@/services/clipboardService';
import { isRemoteUrl, normalizePersistableImageRef } from '@/utils/imageSource';

export const CANVAS_CLIPBOARD_MIME = 'application/x-tanva-canvas';
export const CANVAS_CLIPBOARD_FALLBACK_TEXT = 'Tanva canvas selection';
export const CANVAS_CLIPBOARD_TYPE = 'tanva-canvas';
export const CANVAS_CLIPBOARD_STORAGE_KEY = 'tanva-canvas-clipboard';

export const serializeCanvasClipboard = (data: CanvasClipboardData): string =>
  JSON.stringify({
    type: CANVAS_CLIPBOARD_TYPE,
    version: 1,
    data,
  });

export const parseCanvasClipboardPayload = (
  raw: string,
): CanvasClipboardData | null => {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.type === CANVAS_CLIPBOARD_TYPE && parsed?.data) {
      return parsed.data as CanvasClipboardData;
    }
    if (parsed?.images && parsed?.paths) {
      return parsed as CanvasClipboardData;
    }
  } catch {}
  return null;
};

export const getCanvasClipboardOrigin = (
  data: CanvasClipboardData,
): { x: number; y: number } => {
  if (data.origin && Number.isFinite(data.origin.x) && Number.isFinite(data.origin.y)) {
    return data.origin;
  }

  let minX = Infinity;
  let minY = Infinity;
  const consider = (x: number, y: number) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
    }
  };

  data.images.forEach((img) => consider(img.bounds.x, img.bounds.y));
  data.models.forEach((model) => consider(model.bounds.x, model.bounds.y));
  data.videos.forEach((video) => consider(video.bounds.x, video.bounds.y));
  data.texts.forEach((text) => {
    if (text.bounds) {
      consider(text.bounds.x, text.bounds.y);
      return;
    }
    consider(text.position.x, text.position.y);
  });
  data.paths.forEach((path) => {
    if (path.bounds) {
      consider(path.bounds.x, path.bounds.y);
      return;
    }
    consider(path.position.x, path.position.y);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: 0, y: 0 };
  }
  return { x: minX, y: minY };
};

export const computeCanvasPasteOffset = (
  data: CanvasClipboardData,
  anchor?: { x: number; y: number } | null,
): { x: number; y: number } => {
  const origin = getCanvasClipboardOrigin(data);
  if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
    return { x: anchor.x - origin.x, y: anchor.y - origin.y };
  }
  return { x: 32, y: 32 };
};

/** 跨项目粘贴：去掉源项目图层绑定，优先保留可访问的远程图片 URL */
export const normalizeCanvasClipboardForStorage = (
  data: CanvasClipboardData,
): CanvasClipboardData => ({
  images: data.images.map((img) => {
    const remote =
      normalizePersistableImageRef(img.url || img.src || img.key || null) ||
      (isRemoteUrl(img.url) ? img.url : null) ||
      (isRemoteUrl(img.src) ? img.src : null);

    return {
      ...img,
      layerId: null,
      url: remote || img.url,
      src: remote || img.src,
      key: remote || img.key,
      localDataUrl: remote ? undefined : img.localDataUrl,
      pendingUpload: remote ? false : img.pendingUpload,
    };
  }),
  models: data.models.map((model) => ({ ...model, layerId: null })),
  texts: data.texts.map((text) => ({ ...text, layerId: null })),
  videos: data.videos.map((video) => ({ ...video, layerId: null })),
  paths: data.paths.map((path) => ({ ...path, layerName: undefined })),
  origin: getCanvasClipboardOrigin(data),
});

export const writeCanvasClipboardToSystem = async (
  data: CanvasClipboardData,
): Promise<void> => {
  const serialized = serializeCanvasClipboard(data);
  if (typeof navigator === 'undefined') return;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(serialized);
      return;
    } catch {}
  }
};

export const readCanvasClipboardFromDataTransfer = (
  dataTransfer: DataTransfer | null | undefined,
): CanvasClipboardData | null => {
  if (!dataTransfer) return null;
  const raw =
    dataTransfer.getData(CANVAS_CLIPBOARD_MIME) ||
    dataTransfer.getData('application/json');
  return parseCanvasClipboardPayload(raw);
};
