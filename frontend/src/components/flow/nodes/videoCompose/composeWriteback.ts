import type { VideoComposeProgress } from "./types";

type ComposeWritebackArgs = {
  blob: Blob;
  fileName: string;
  thumbnailUrl?: string;
  updateNodeData: (patch: Record<string, any>) => void;
  uploadToOSS: (file: File) => Promise<string>;
  onProgress?: (progress: VideoComposeProgress) => void;
};

type ComposeWritebackResult = {
  blobUrl: string;
  persistentUrl?: string;
};

export async function composeWriteback(
  args: ComposeWritebackArgs
): Promise<ComposeWritebackResult> {
  const { blob, fileName, thumbnailUrl, updateNodeData, uploadToOSS, onProgress } = args;
  const blobUrl = URL.createObjectURL(blob);

  updateNodeData({
    status: "ready",
    videoUrl: blobUrl,
    tempBlobUrl: blobUrl,
    thumbnail: thumbnailUrl,
    uploadStatus: "uploading",
    error: undefined,
  });
  onProgress?.({ phase: "upload", progress: 5, message: "已生成本地预览，开始上传" });

  try {
    const file = new File([blob], fileName, { type: "video/mp4" });
    onProgress?.({ phase: "upload", progress: 35, message: "上传合成视频到 OSS" });
    const persistentUrl = await uploadToOSS(file);
    updateNodeData({
      videoUrl: persistentUrl,
      persistedVideoUrl: persistentUrl,
      tempBlobUrl: undefined,
      uploadStatus: "done",
      error: undefined,
    });
    onProgress?.({ phase: "upload", progress: 100, message: "上传完成" });
    return { blobUrl, persistentUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传合成视频失败";
    updateNodeData({
      uploadStatus: "error",
      error: message,
    });
    onProgress?.({ phase: "upload", progress: 100, message });
    return { blobUrl };
  }
}
