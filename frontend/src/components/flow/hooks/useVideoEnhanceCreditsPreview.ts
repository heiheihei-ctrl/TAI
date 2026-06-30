import { useBackendCreditsPreview } from "./useBackendCreditsPreview";
import type { VideoEnhanceNodeData } from "@/types/videoEnhance";

export const useVideoEnhanceCreditsPreview = (
  params: Pick<
    VideoEnhanceNodeData,
    "toolVersion" | "scene" | "resolutionMode" | "resolution" | "resolutionLimit" | "fps"
  >
) => {
  const requestParams = {
    toolVersion: params.toolVersion || "standard",
    scene: params.scene || "aigc",
    ...(params.resolutionMode === "limit"
      ? { resolutionLimit: params.resolutionLimit ?? 1080 }
      : { resolution: params.resolution || "1080p" }),
    ...(typeof params.fps === "number" ? { fps: params.fps } : {}),
    managedModelKey: "volc-enhance-video",
    modelKey: "volc-enhance-video",
    vendorKey: "volc-enhance-video",
    platformKey: "volc-enhance-video",
    aiProvider: "volc-enhance-video",
  };

  return useBackendCreditsPreview({
    serviceType: "volc-enhance-video",
    model: "volc-enhance-video",
    requestParams,
    enabled: true,
  });
};
