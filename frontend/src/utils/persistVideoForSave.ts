import { uploadVideoToOSS } from "@/stores/aiChatStore";
import { imageUploadService } from "@/services/imageUploadService";
import { proxifyRemoteAssetUrl } from "@/utils/assetProxy";
import { isPersistableImageRef } from "@/utils/imageSource";

export function isPersistedManagedVideoRef(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(projects|uploads|templates|videos|ai)\//i.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    const pathKey = parsed.pathname.replace(/^\/+/, "");
    if (/^(projects|uploads|templates|videos|ai)\//i.test(pathKey)) return true;
    if (
      parsed.hostname.includes("volces.com") ||
      parsed.hostname.includes("tos-s3") ||
      (parsed.hostname.includes("aliyuncs.com") && !trimmed.includes("X-Amz"))
    ) {
      return true;
    }
  } catch {
    // ignore parse errors
  }
  return false;
}

async function verifyVideoRefReadable(value: string): Promise<boolean> {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const target = proxifyRemoteAssetUrl(trimmed);
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      credentials: "omit",
      cache: "no-store",
    });
    return response.ok || response.status === 206;
  } catch {
    return false;
  }
}

export async function persistGeneratedVideoUrlForSave(
  videoUrl: string | undefined,
  projectId?: string | null
): Promise<string | undefined> {
  if (typeof videoUrl !== "string") return undefined;
  const trimmed = videoUrl.trim();
  if (!trimmed) return undefined;

  if (isPersistedManagedVideoRef(trimmed)) {
    if (await verifyVideoRefReadable(trimmed)) {
      return trimmed;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const uploaded = await uploadVideoToOSS(trimmed, projectId);
        if (uploaded) return uploaded;
      } catch {
        // fall through
      }
    }
    return undefined;
  }

  try {
    const uploaded = await uploadVideoToOSS(trimmed, projectId);
    return uploaded || trimmed;
  } catch {
    return trimmed;
  }
}

export async function persistVideoThumbnailForSave(
  thumbnail: string | undefined,
  projectId?: string | null
): Promise<string | undefined> {
  if (typeof thumbnail !== "string") return undefined;
  const trimmed = thumbnail.trim();
  if (!trimmed) return undefined;
  if (isPersistableImageRef(trimmed)) {
    if (await verifyVideoRefReadable(trimmed)) {
      return trimmed;
    }
    return undefined;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const upload = await imageUploadService.uploadImageSource(trimmed, {
        projectId: projectId ?? undefined,
        dir: projectId ? `projects/${projectId}/flow/thumbnails/` : "uploads/flow/thumbnails/",
        fileName: `video-thumb-${Date.now()}.jpg`,
      });
      const ref = upload.asset?.key || upload.asset?.url;
      if (upload.success && ref) return ref.trim();
    } catch {
      // ignore thumbnail persist failures
    }
  }
  return undefined;
}
