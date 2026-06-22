/**
 * 下载工具函数
 */

import { toRenderableImageSrc } from "@/utils/imageSource";
import { canvasToBlob } from "@/utils/imageConcurrency";
import { fetchWithAuth } from "@/services/authFetch";
import { requestSkipNextBeforeUnloadPrompt } from "@/utils/beforeUnloadGuard";
import { proxifyRemoteAssetUrl } from "@/utils/assetProxy";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "svg",
  "jfif",
]);

const extractMimeType = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.startsWith("data:")) {
    const match = /^data:([^;,]+)/i.exec(trimmed);
    return match?.[1]?.toLowerCase() || null;
  }
  return null;
};

const inferExtensionFromMimeType = (mimeType?: string | null): string | null => {
  if (!mimeType) return null;
  return MIME_EXTENSION_MAP[mimeType.trim().toLowerCase()] || null;
};

const inferExtensionFromUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    const cleanPath = url.pathname.toLowerCase();
    const dotIndex = cleanPath.lastIndexOf(".");
    if (dotIndex < 0) return null;
    const extension = cleanPath.slice(dotIndex + 1);
    return IMAGE_EXTENSIONS.has(extension) ? extension : null;
  } catch {
    return null;
  }
};

const normalizeExtension = (extension?: string | null): string | null => {
  if (!extension) return null;
  const lower = extension.trim().toLowerCase();
  if (!lower) return null;
  if (lower === "jpeg" || lower === "jfif") return "jpg";
  return lower;
};

const ensureFileNameMatchesActualFormat = (
  fileName: string,
  formatHint?: string | null
): string => {
  const normalizedHint = normalizeExtension(formatHint);
  const trimmedName = fileName.trim() || "image";
  const dotIndex = trimmedName.lastIndexOf(".");
  const fallbackExtension = normalizedHint || "png";

  if (dotIndex <= 0 || dotIndex === trimmedName.length - 1) {
    return `${trimmedName.replace(/\.+$/, "")}.${fallbackExtension}`;
  }

  const currentExtension = normalizeExtension(trimmedName.slice(dotIndex + 1));
  if (normalizedHint && currentExtension !== normalizedHint) {
    return `${trimmedName.slice(0, dotIndex)}.${normalizedHint}`;
  }

  return trimmedName;
};

const triggerBrowserDownload = (url: string, fileName: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  requestSkipNextBeforeUnloadPrompt();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * 下载图片文件
 * @param imageData - 图片数据URL或base64数据
 * @param fileName - 下载的文件名
 */
export const downloadImage = async (imageData: string, fileName: string = 'image') => {
  try {
    const downloadUrl = toRenderableImageSrc(imageData) || imageData;
    const dataUrlMimeType = extractMimeType(downloadUrl);
    const dataUrlExtension = inferExtensionFromMimeType(dataUrlMimeType);

    if (downloadUrl.startsWith("data:")) {
      const resolvedFileName = ensureFileNameMatchesActualFormat(fileName, dataUrlExtension);
      triggerBrowserDownload(downloadUrl, resolvedFileName);
      console.log("✅ 图片下载成功:", resolvedFileName);
      return;
    }

    const isRemoteUrl = /^https?:\/\//i.test(downloadUrl);
    if (isRemoteUrl || downloadUrl.startsWith("blob:")) {
      const fetchUrl = isRemoteUrl
        ? proxifyRemoteAssetUrl(downloadUrl, { forceProxy: true }) || downloadUrl
        : downloadUrl;
      const response = await fetchWithAuth(fetchUrl, {
        auth: "omit",
        allowRefresh: false,
        credentials: "omit",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const actualExtension =
        inferExtensionFromMimeType(blob.type) ||
        (isRemoteUrl ? inferExtensionFromUrl(downloadUrl) : null);
      const resolvedFileName = ensureFileNameMatchesActualFormat(fileName, actualExtension);

      try {
        triggerBrowserDownload(blobUrl, resolvedFileName);
      } finally {
        setTimeout(() => {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch {}
        }, 0);
      }

      console.log("✅ 图片下载成功:", resolvedFileName);
      return;
    }

    const resolvedFileName = ensureFileNameMatchesActualFormat(
      fileName,
      dataUrlExtension || inferExtensionFromUrl(downloadUrl)
    );
    triggerBrowserDownload(downloadUrl, resolvedFileName);
    console.log("✅ 图片下载成功:", resolvedFileName);
  } catch (error) {
    console.error('❌ 图片下载失败:', error);
    // 如果下载失败，尝试在新窗口打开图片
    try {
      const url = toRenderableImageSrc(imageData) || imageData;
      window.open(url, '_blank');
    } catch (openError) {
      console.error('❌ 无法打开图片:', openError);
    }
  }
};

/**
 * 从Canvas下载图片
 * @param canvas - Canvas元素
 * @param fileName - 下载的文件名
 * @param quality - 图片质量(0-1)，默认0.92
 */
export const downloadCanvasAsImage = (
  canvas: HTMLCanvasElement, 
  fileName: string = 'canvas-image',
  quality: number = 0.92
) => {
  try {
    void (async () => {
      const blob = await canvasToBlob(canvas, { type: "image/png", quality });
      const blobUrl = URL.createObjectURL(blob);
      try {
        await downloadImage(blobUrl, fileName);
      } finally {
        // 释放 blob URL，避免内存泄漏
        setTimeout(() => {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch {}
        }, 0);
      }
    })().catch((error) => {
      console.error("❌ Canvas下载失败:", error);
    });
  } catch (error) {
    console.error('❌ Canvas下载失败:', error);
  }
};

/**
 * 获取建议的文件名
 * @param originalName - 原始文件名
 * @param prefix - 前缀
 */
export const getSuggestedFileName = (originalName?: string, prefix: string = 'download') => {
  if (originalName && originalName.includes('.')) {
    return originalName;
  }
  
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  const baseName = originalName || prefix;
  return `${baseName}_${timestamp}`;
};

/**
 * 下载文件（支持URL和Blob）
 * @param url - 文件URL
 * @param fileName - 下载的文件名
 */
export const downloadFile = async (url: string, fileName: string = 'download') => {
  const resolvedUrl = toRenderableImageSrc(url) || url;
  const fetchUrl =
    /^https?:\/\//i.test(resolvedUrl)
      ? proxifyRemoteAssetUrl(resolvedUrl, { forceProxy: true }) || resolvedUrl
      : resolvedUrl;
  try {
    // 如果是data URL或blob URL，直接下载
    if (fetchUrl.startsWith('data:') || fetchUrl.startsWith('blob:')) {
      const link = document.createElement('a');
      link.href = fetchUrl;
      link.download = fileName;
      requestSkipNextBeforeUnloadPrompt();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log('✅ 文件下载成功:', fileName);
      return;
    }

    // 如果是HTTP/HTTPS URL，先fetch再下载
    const response = await fetchWithAuth(fetchUrl, {
      auth: "omit",
      allowRefresh: false,
      credentials: "omit",
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    requestSkipNextBeforeUnloadPrompt();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 清理blob URL
    URL.revokeObjectURL(blobUrl);
    
    console.log('✅ 文件下载成功:', fileName);
  } catch (error) {
    console.error('❌ 文件下载失败:', error);
    // 如果下载失败，尝试在新窗口打开
    try {
      window.open(fetchUrl, '_blank');
    } catch (openError) {
      console.error('❌ 无法打开文件:', openError);
      throw error;
    }
  }
};
