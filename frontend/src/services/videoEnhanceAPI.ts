import { getApiBaseUrl } from "@/utils/assetProxy";
import { fetchWithAuth } from "./authFetch";
import type {
  CreateVideoEnhanceTaskRequest,
  CreateVideoEnhanceTaskResponse,
  QueryVideoEnhanceTaskResponse,
} from "@/types/videoEnhance";

export async function createVideoEnhanceTask(
  payload: CreateVideoEnhanceTaskRequest
): Promise<CreateVideoEnhanceTaskResponse> {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetchWithAuth(`${apiBaseUrl}/api/ai/volc-enhance-video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function queryVideoEnhanceTask(
  taskId: string
): Promise<QueryVideoEnhanceTaskResponse> {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetchWithAuth(
    `${apiBaseUrl}/api/ai/volc-enhance-video/${encodeURIComponent(taskId)}`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

