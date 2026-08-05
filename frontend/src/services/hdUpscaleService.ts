import { logger } from '@/utils/logger';
import { fetchWithAuth } from './authFetch';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim().length > 0
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')
    : 'http://localhost:4000';

const UPSCALE_API_URL = `${API_BASE_URL}/api/ai/upscale-image`;

type HdResolution = '2k' | '4k';

export interface OptimizeHdImageParams {
  imageUrl: string;
  resolution?: HdResolution;
  filenamePrefix?: string;
}

export interface OptimizeHdImageResult {
  success: boolean;
  imageUrl?: string;
  promptId?: string;
  error?: string;
}

export async function optimizeHdImage({
  imageUrl,
  resolution = '4k',
  filenamePrefix = 'hd_upscaled_image',
}: OptimizeHdImageParams): Promise<OptimizeHdImageResult> {
  if (!imageUrl) {
    return { success: false, error: '缺少图片URL' };
  }

  const requestBody = {
    imageUrl,
    resolution,
    filenamePrefix,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15 * 60 * 1000); // 15分钟

  try {
    const response = await fetchWithAuth(UPSCALE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('高清放大请求失败', { status: response.status, error: errorText });
      return {
        success: false,
        error: `高清放大失败（HTTP ${response.status}）`,
      };
    }

    const data = await response.json();

    if (!data?.success) {
      return {
        success: false,
        error: data?.message || '高清放大处理失败',
      };
    }

    return {
      success: true,
      imageUrl: data.imageUrl,
      promptId: data.promptId,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    const message = isAbort ? '请求超时，请稍后重试' : (error as Error)?.message || '高清放大失败';
    logger.error('调用高清放大接口异常', error);
    return {
      success: false,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

