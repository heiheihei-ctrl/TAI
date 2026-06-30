import React from "react";
import {
  VIDEO_ENHANCE_MAX_POLLS,
  VIDEO_ENHANCE_POLL_INTERVAL_MS,
} from "@/constants/videoEnhance";
import { markVideoTaskSuccess, refundVideoTask } from "@/services/videoProviderAPI";
import { queryVideoEnhanceTask } from "@/services/videoEnhanceAPI";
import type { QueryVideoEnhanceTaskResponse } from "@/types/videoEnhance";

type PollingCallbacks = {
  onProgress: (patch: Record<string, any>) => void;
  onSucceeded: (payload: {
    result: QueryVideoEnhanceTaskResponse;
    processingTime: number;
  }) => void;
  onFailed: (payload: { error: string; processingTime: number; timedOut?: boolean }) => void;
};

type StartPollingParams = {
  taskId: string;
  apiUsageId?: string;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export const useVideoEnhancePolling = (callbacks: PollingCallbacks) => {
  const activePollKeyRef = React.useRef<string>("");

  const startPolling = React.useCallback(
    async ({ taskId, apiUsageId }: StartPollingParams) => {
      const pollKey = `${taskId}:${apiUsageId || ""}:${Date.now()}`;
      activePollKeyRef.current = pollKey;
      const startedAt = Date.now();
      try {
        for (let attempt = 1; attempt <= VIDEO_ENHANCE_MAX_POLLS; attempt += 1) {
          if (attempt > 1) {
            await sleep(VIDEO_ENHANCE_POLL_INTERVAL_MS);
          }
          if (activePollKeyRef.current !== pollKey) return;

          const result = await queryVideoEnhanceTask(taskId);
          const processingTime = Math.max(0, Date.now() - startedAt);

          if (result.status === "succeeded") {
            if (!result.videoUrl) {
              throw new Error("Video enhance task succeeded but videoUrl is missing");
            }
            if (apiUsageId) {
              await markVideoTaskSuccess(apiUsageId, processingTime);
            }
            callbacks.onSucceeded({ result, processingTime });
            return;
          }

          if (result.status === "failed") {
            if (apiUsageId) {
              await refundVideoTask(apiUsageId);
            }
            callbacks.onFailed({
              error: result.error || "Video enhance failed",
              processingTime,
            });
            return;
          }

          const baseProgress = result.status === "processing" ? 12 : 4;
          const computedProgress = Math.min(
            95,
            baseProgress + Math.round((attempt / VIDEO_ENHANCE_MAX_POLLS) * 83)
          );
          callbacks.onProgress({
            status: "running",
            progress: computedProgress,
            taskId,
            apiUsageId,
            pendingTaskId: taskId,
            pendingApiUsageId: apiUsageId,
            pendingStartMs: startedAt,
            upstreamStatus: result.upstreamStatus,
            error: undefined,
          });
        }

        const processingTime = Math.max(0, Date.now() - startedAt);
        if (apiUsageId) {
          await refundVideoTask(apiUsageId);
        }
        callbacks.onFailed({
          error: "Video enhance polling timed out",
          processingTime,
          timedOut: true,
        });
      } catch (error) {
        const processingTime = Math.max(0, Date.now() - startedAt);
        if (apiUsageId) {
          await refundVideoTask(apiUsageId).catch(() => {});
        }
        callbacks.onFailed({
          error: error instanceof Error ? error.message : "Video enhance polling failed",
          processingTime,
        });
      }
    },
    [callbacks]
  );

  const stopPolling = React.useCallback(() => {
    activePollKeyRef.current = "";
  }, []);

  React.useEffect(() => stopPolling, [stopPolling]);

  return {
    startPolling,
    stopPolling,
  };
};
