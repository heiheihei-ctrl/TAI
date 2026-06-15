import { fetchWithAuth } from '@/services/authFetch';
import { blobToDataUrl, responseToBlob } from '@/utils/imageConcurrency';
import { toRenderableImageSrc } from '@/utils/imageSource';
import { proxifyRemoteAssetUrl } from '@/utils/assetProxy';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL &&
  import.meta.env.VITE_API_BASE_URL.trim().length > 0
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')
    : 'http://localhost:4000') + '/api';

type ApplyWatermarkResponse = {
  success?: boolean;
  imageData?: string;
  format?: string;
};

async function imageSourceToDataUrl(imageData: string): Promise<string> {
  const trimmed = imageData.trim();
  if (!trimmed) {
    throw new Error('Empty image data');
  }

  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  if (trimmed.startsWith('blob:')) {
    const response = await fetch(trimmed);
    const blob = await responseToBlob(response);
    return blobToDataUrl(blob);
  }

  const renderable = toRenderableImageSrc(trimmed) || trimmed;
  const fetchUrl =
    /^https?:\/\//i.test(renderable)
      ? proxifyRemoteAssetUrl(renderable, { forceProxy: true }) || renderable
      : renderable;

  const response = await fetchWithAuth(fetchUrl, {
    auth: 'omit',
    allowRefresh: false,
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await responseToBlob(response);
  return blobToDataUrl(blob);
}

export async function applyExportWatermark(imageData: string): Promise<string> {
  const dataUrl = await imageSourceToDataUrl(imageData);
  const endpoint = `${API_BASE_URL}/ai/watermark/apply`;
  const response = await fetchWithAuth(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageData: dataUrl }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      typeof errorData?.message === 'string'
        ? errorData.message
        : `Apply watermark failed (${response.status})`;
    throw new Error(message);
  }

  const data = (await response.json()) as ApplyWatermarkResponse;
  if (!data?.imageData) {
    throw new Error('Apply watermark returned empty image data');
  }

  return data.imageData;
}
