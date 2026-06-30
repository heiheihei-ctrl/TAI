import React from "react";

import { composeVideosToBlob } from "./composeVideosToBlob";
import type {
  VideoComposeAudioTrack,
  VideoComposeProgress,
  VideoComposeSource,
} from "./types";

type StartComposeArgs = {
  sources: VideoComposeSource[];
  audioTrack?: VideoComposeAudioTrack;
  width?: number;
  height?: number;
  fps?: number;
};

export function useVideoCompose() {
  const abortRef = React.useRef<AbortController | null>(null);
  const [composing, setComposing] = React.useState(false);
  const [progress, setProgress] = React.useState<VideoComposeProgress | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const cancel = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setComposing(false);
  }, []);

  const start = React.useCallback(async (args: StartComposeArgs) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setComposing(true);
    setProgress({ phase: "prepare", progress: 0, message: "开始准备资源" });
    setError(null);
    try {
      const blob = await composeVideosToBlob({
        ...args,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setProgress({ phase: "output", progress: 100, message: "合成完成" });
      return blob;
    } catch (err) {
      if (controller.signal.aborted) {
        setError("合成已取消");
        throw err;
      }
      const message = err instanceof Error ? err.message : "视频合成失败";
      setError(message);
      throw err;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setComposing(false);
    }
  }, []);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  return {
    composing,
    progress,
    error,
    start,
    cancel,
  };
}
