import { buildToapisUrl } from './toapisHttpClient';

const pickString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** 从 APIMart / ToAPIs 提交或查询响应中提取任务 ID */
export function extractUpstreamImageTaskId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;

  const direct =
    pickString(root.id) ||
    pickString(root.task_id) ||
    pickString(root.taskId);
  if (direct) return direct;

  const data = root.data;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (first && typeof first === 'object') {
      const item = first as Record<string, unknown>;
      return (
        pickString(item.task_id) ||
        pickString(item.taskId) ||
        pickString(item.id) ||
        null
      );
    }
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    return (
      pickString(nested.task_id) ||
      pickString(nested.taskId) ||
      pickString(nested.id) ||
      null
    );
  }

  return null;
}

/** 归一化任务状态（小写） */
export function extractUpstreamImageTaskStatus(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'processing';
  const root = payload as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;

  const status =
    pickString(nested.status) ||
    pickString(nested.task_status) ||
    pickString(nested.taskStatus) ||
    pickString(root.status);

  return status ? status.toLowerCase() : 'processing';
}

/** 从任务查询响应中提取图片 URL */
export function extractUpstreamImageUrl(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const root = payload as Record<string, unknown>;
  const candidates: unknown[] = [root];

  if (root.data && typeof root.data === 'object') {
    candidates.push(root.data);
  }

  for (const node of candidates) {
    if (!node || typeof node !== 'object') continue;
    const data = node as Record<string, unknown>;

    const directCandidates = [
      data.image_url,
      data.imageUrl,
      (data.result as Record<string, unknown> | undefined)?.image_url,
      (data.result as Record<string, unknown> | undefined)?.imageUrl,
    ];
    for (const candidate of directCandidates) {
      const url = pickString(candidate);
      if (url) return url;
    }

    const result = data.result;
    if (result && typeof result === 'object') {
      const resultObj = result as Record<string, unknown>;

      const resultData = resultObj.data;
      if (Array.isArray(resultData) && resultData.length > 0) {
        const first = resultData[0];
        if (first && typeof first === 'object') {
          const url = pickString((first as Record<string, unknown>).url);
          if (url) return url;
        }
      }

      const images = resultObj.images;
      if (Array.isArray(images) && images.length > 0) {
        const first = images[0];
        if (first && typeof first === 'object') {
          const urlField = (first as Record<string, unknown>).url;
          if (typeof urlField === 'string' && urlField.trim()) {
            return urlField.trim();
          }
          if (Array.isArray(urlField) && typeof urlField[0] === 'string') {
            return urlField[0].trim();
          }
        }
      }
    }
  }

  return undefined;
}

export function extractUpstreamImageTaskError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const root = payload as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;

  const error = nested.error ?? root.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    return pickString((error as Record<string, unknown>).message) || undefined;
  }
  return pickString(nested.fail_reason) || pickString(nested.failReason) || undefined;
}

export function isUpstreamImageTaskCompleted(status: string): boolean {
  return ['succeeded', 'completed', 'success', 'finished'].includes(status);
}

export function isUpstreamImageTaskFailed(status: string): boolean {
  return ['failed', 'failure', 'error', 'cancelled', 'canceled', 'rejected', 'blocked'].includes(
    status,
  );
}

/** ToAPIs 优先 /images/generations/{id}，兼容 APIMart /tasks/{id} */
export function buildUpstreamImageTaskQueryUrls(taskId: string): string[] {
  const encoded = encodeURIComponent(taskId);
  return [
    buildToapisUrl(`/images/generations/${encoded}`),
    buildToapisUrl(`/tasks/${encoded}`),
  ];
}
