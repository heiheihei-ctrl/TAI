import { fetchWithAuth } from "@/services/authFetch";
import { getApiBaseUrl } from "@/utils/assetProxy";
import {
  isLikelyBackendAllowedRemoteUrl,
  isLikelyManagedAssetUrl,
  isRemoteUrl,
} from "@/utils/imageSource";

type EnsureComposeSourceUrlOptions = {
  kind: "video" | "audio";
  signal?: AbortSignal;
};

const transferCache = new Map<string, Promise<string>>();

const shouldTransferRemoteMedia = (url: string, kind: "video" | "audio") => {
  if (kind !== "video") return false;
  if (!isRemoteUrl(url)) return false;
  if (url.startsWith("/api/assets/proxy") || url.startsWith("/assets/proxy")) return false;
  // If the backend proxy already supports this host, keep the original remote URL
  // and avoid re-transferring the same source every time the editor reopens.
  if (isLikelyBackendAllowedRemoteUrl(url)) return false;
  return !isLikelyManagedAssetUrl(url);
};

const transferRemoteVideoToOSS = async (videoUrl: string, signal?: AbortSignal) => {
  const cached = transferCache.get(videoUrl);
  if (cached) {
    return cached;
  }

  const request = (async () => {
    const response = await fetchWithAuth(`${getApiBaseUrl()}/api/uploads/transfer-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ videoUrl }),
      signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(
        payload?.message || payload?.error || `外部视频转存失败: ${response.status} ${response.statusText}`
      );
    }

    const payload = await response.json().catch(() => ({}));
    if (typeof payload?.url !== "string" || !payload.url.trim()) {
      throw new Error("外部视频转存成功，但未返回可用 URL");
    }
    return payload.url.trim();
  })();

  transferCache.set(videoUrl, request);

  try {
    return await request;
  } catch (error) {
    transferCache.delete(videoUrl);
    throw error;
  }
};

export async function ensureComposeSourceUrl(
  inputUrl: string,
  options: EnsureComposeSourceUrlOptions
): Promise<string> {
  const trimmed = typeof inputUrl === "string" ? inputUrl.trim() : "";
  if (!trimmed) {
    throw new Error("缺少可用的媒体地址");
  }

  if (!shouldTransferRemoteMedia(trimmed, options.kind)) {
    return trimmed;
  }
  try {
    return await transferRemoteVideoToOSS(trimmed, options.signal);
  } catch (error) {
    if (isLikelyBackendAllowedRemoteUrl(trimmed)) {
      console.warn("[ensureComposeSourceUrl] transfer-video failed, fallback to remote URL:", error);
      return trimmed;
    }
    throw error;
  }
}
