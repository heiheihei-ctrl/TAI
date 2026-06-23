import { fetchWithAuth } from "./authFetch";
import { getApiBaseUrl } from "../utils/assetProxy";
import { markVideoTaskSuccess, refundVideoTask } from "./videoProviderAPI";

export type TencentSpeechRequest = {
  inputVideoUrl: string;
  text?: string;
  speakerUrl?: string;
  voiceId?: string;
  speakerGender?: string;
  srcLang?: string;
  dstLang?: string;
  dstLangs?: string[];
  srcSubtitleUrl?: string;
  dstSubtitleUrl?: string;
  dstSubtitleUrls?: Record<string, string>;
  embedSubtitle?: boolean;
  font?: string;
  fontSize?: number;
  marginV?: number;
  outputPattern?: string;
  notifyUrl?: string;
};

export type TencentSpeechResult = {
  taskId?: string;
  status?: string;
  requestId?: string;
  audioUrl?: string;
  videoUrl?: string;
  speakerUrl?: string;
  failReason?: string;
  apiUsageId?: string;
};

export type TencentVoicePreview = {
  voiceId: string;
  name: string;
  audioUrl?: string;
  gender?: string;
  languages?: string[];
  description?: string;
};

const apiBaseUrl = () => getApiBaseUrl();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function createTencentSpeechTask(
  request: TencentSpeechRequest
): Promise<TencentSpeechResult> {
  const response = await fetchWithAuth(`${apiBaseUrl()}/api/ai/tencent-speech/async`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function queryTencentSpeechTask(taskId: string): Promise<TencentSpeechResult> {
  const normalizedTaskId = encodeURIComponent(taskId.trim());
  const response = await fetchWithAuth(
    `${apiBaseUrl()}/api/ai/tencent-speech/async/${normalizedTaskId}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function fetchTencentSystemVoices(options?: {
  lang?: string;
  keyword?: string;
}): Promise<TencentVoicePreview[]> {
  const params = new URLSearchParams();
  if (options?.lang?.trim()) params.set("lang", options.lang.trim());
  if (options?.keyword?.trim()) params.set("keyword", options.keyword.trim());
  const query = params.toString();
  const response = await fetchWithAuth(
    `${apiBaseUrl()}/api/ai/tencent-speech/voices${query ? `?${query}` : ""}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.voices) ? payload.voices : [];
}

const isSuccessStatus = (status?: string) => {
  const normalized = String(status || "").trim().toUpperCase();
  return normalized === "SUCCESS" || normalized === "FINISH" || normalized === "SUCCEEDED";
};

const isFailureStatus = (status?: string) => {
  const normalized = String(status || "").trim().toUpperCase();
  return (
    normalized === "FAIL" ||
    normalized === "FAILED" ||
    normalized === "CANCELED" ||
    normalized === "CANCELLED"
  );
};

/** 创建异步任务并轮询至完成（含积分确认/退款） */
export async function runTencentSpeechTask(
  request: TencentSpeechRequest,
  options?: {
    pollIntervalMs?: number;
    maxWaitMs?: number;
    onProgress?: (payload: { status?: string; taskId?: string }) => void;
  }
): Promise<TencentSpeechResult> {
  const pollIntervalMs = options?.pollIntervalMs ?? 5000;
  const maxWaitMs = options?.maxWaitMs ?? 600_000;
  const startedAt = Date.now();

  const createResult = await createTencentSpeechTask(request);
  const taskId = createResult.taskId?.trim();
  if (!taskId) {
    if (createResult.audioUrl || createResult.videoUrl) {
      return createResult;
    }
    throw new Error("腾讯配音任务创建失败：未返回 taskId");
  }

  const apiUsageId = createResult.apiUsageId;
  options?.onProgress?.({ status: createResult.status, taskId });

  while (Date.now() - startedAt < maxWaitMs) {
    const queryResult = await queryTencentSpeechTask(taskId);
    options?.onProgress?.({ status: queryResult.status, taskId });

    if (queryResult.audioUrl || queryResult.videoUrl) {
      if (apiUsageId) {
        const processingTime = Math.max(0, Date.now() - startedAt);
        void markVideoTaskSuccess(apiUsageId, processingTime).catch(() => {});
      }
      return { ...queryResult, apiUsageId };
    }

    if (isSuccessStatus(queryResult.status)) {
      if (apiUsageId) {
        const processingTime = Math.max(0, Date.now() - startedAt);
        void markVideoTaskSuccess(apiUsageId, processingTime).catch(() => {});
      }
      return { ...queryResult, apiUsageId };
    }

    if (isFailureStatus(queryResult.status)) {
      if (apiUsageId) {
        try {
          await refundVideoTask(apiUsageId);
        } catch {
          // ignore refund errors
        }
      }
      throw new Error(
        queryResult.failReason?.trim() ||
          `腾讯配音任务失败（${queryResult.status || "FAILED"}）`
      );
    }

    await sleep(pollIntervalMs);
  }

  if (createResult.apiUsageId) {
    try {
      await refundVideoTask(createResult.apiUsageId);
    } catch {
      // ignore
    }
  }

  throw new Error(`腾讯配音任务超时（>${Math.ceil(maxWaitMs / 1000)}s）`);
}
