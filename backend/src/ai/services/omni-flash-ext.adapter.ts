import { BadRequestException } from '@nestjs/common';

export const OMNI_FLASH_EXT_MODEL_KEY = 'omni-flash-ext';
/** @deprecated 使用 OMNI_FLASH_EXT_TOAPIS_MODEL */
export const OMNI_FLASH_EXT_APIMART_MODEL = 'gemini_omni_flash';
export const OMNI_FLASH_EXT_TOAPIS_MODEL = 'gemini_omni_flash';

export type OmniFlashExtVideoMode = 'frame' | 'reference';

export interface OmniFlashExtBuildInput {
  prompt?: string | null;
  referenceImages?: unknown;
  referenceVideos?: unknown;
  duration?: unknown;
  resolution?: unknown;
  aspectRatio?: unknown;
  videoMode?: unknown;
  managedModelKey?: unknown;
  provider?: unknown;
  metadata?: Record<string, any> | null;
  content?: unknown;
  image?: unknown;
  images?: unknown;
  video_urls?: unknown;
  reference_videos?: unknown;
}

export interface OmniFlashExtNewApiPayload {
  model: 'omni-flash-ext';
  prompt: string;
  image?: string;
  images?: string[];
  reference_videos?: string[];
  duration?: number;
  resolution: string;
  aspect_ratio: string;
  metadata: {
    generation_type: OmniFlashExtVideoMode;
    video_urls?: string[];
  };
  provider_options: {
    managedModelKey: 'omni-flash-ext';
    videoMode: OmniFlashExtVideoMode;
  };
}

export interface OmniFlashExtApimartPayload {
  model: 'gemini_omni_flash';
  prompt: string;
  image_urls?: string[];
  duration?: number;
  resolution: string;
  aspect_ratio: string;
}

export type OmniFlashExtToapisPayload = OmniFlashExtApimartPayload;

export interface OmniFlashExtTaskQueryResult {
  status: 'processing' | 'succeeded' | 'failed';
  rawStatus: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

const REMOTE_OR_MANAGED_REF_REGEX =
  /^(https?:\/\/|projects\/|uploads\/|templates\/|videos\/|ai\/|asset:\/\/)/i;
const TEMP_REF_REGEX = /^(blob:|data:)/i;
const BARE_BASE64_REGEX = /^[A-Za-z0-9+/=]{80,}$/;

const asTrimmedString = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const pushUrl = (output: string[], value: unknown) => {
  const trimmed = asTrimmedString(value);
  if (!trimmed) return;
  if (!output.includes(trimmed)) output.push(trimmed);
};

const collectStrings = (value: unknown): string[] => {
  const output: string[] = [];
  const visit = (item: unknown) => {
    if (!item) return;
    if (typeof item === 'string') {
      pushUrl(output, item);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item === 'object') {
      const record = item as Record<string, unknown>;
      pushUrl(output, record.url);
      pushUrl(output, record.image_url);
      pushUrl(output, record.video_url);
    }
  };
  visit(value);
  return output;
};

const collectFromContent = (
  content: unknown,
): { imageUrls: string[]; videoUrls: string[] } => {
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const list = Array.isArray(content) ? content : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, any>;
    const type = asTrimmedString(record.type).toLowerCase();
    if (type === 'image_url') {
      collectStrings(record.image_url).forEach((url) => pushUrl(imageUrls, url));
    } else if (type === 'video_url') {
      collectStrings(record.video_url).forEach((url) => pushUrl(videoUrls, url));
    }
  }
  return { imageUrls, videoUrls };
};

export const normalizeOmniFlashExtModelKey = (value: unknown): string => {
  const normalized = asTrimmedString(value).toLowerCase().replace(/_/g, '-');
  if (normalized === 'omni-flash-ext' || normalized === 'omni-flash-ext-apimart') {
    return OMNI_FLASH_EXT_MODEL_KEY;
  }
  return normalized;
};

export const isOmniFlashExtModelKey = (value: unknown): boolean =>
  normalizeOmniFlashExtModelKey(value) === OMNI_FLASH_EXT_MODEL_KEY;

const normalizeTaskPayload = (
  payload: unknown,
  taskId?: string,
): Record<string, any> => {
  if (!payload || typeof payload !== 'object') return {};

  const root = payload as Record<string, any>;
  const data = root.data ?? root;
  if (Array.isArray(data)) {
    const records = data.filter(
      (item): item is Record<string, any> =>
        !!item && typeof item === 'object' && !Array.isArray(item),
    );
    const matched =
      taskId &&
      records.find((item) => {
        const candidate =
          item.task_id ?? item.taskId ?? item.id ?? item.video_id ?? item.job_id;
        return candidate !== undefined && candidate !== null && String(candidate) === taskId;
      });
    return { ...root, ...(matched || records[0] || {}) };
  }

  if (data && typeof data === 'object') {
    return data === root ? root : { ...root, ...(data as Record<string, any>) };
  }
  return root;
};

const isLikelyImageUrl = (value: string): boolean =>
  /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(value);

const pickMediaUrl = (values: unknown[], mediaType: 'video' | 'image'): string | undefined => {
  const visit = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!/^https?:\/\//i.test(trimmed)) return undefined;
      if (mediaType === 'video' && isLikelyImageUrl(trimmed)) return undefined;
      if (mediaType === 'image' && !isLikelyImageUrl(trimmed)) return undefined;
      return trimmed;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return undefined;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const keys =
        mediaType === 'video'
          ? ['video_url', 'videoUrl', 'download_url', 'file_url', 'resource_url', 'url']
          : ['thumbnail_url', 'thumbnailUrl', 'cover_image_url', 'cover_url', 'poster_url', 'url'];
      for (const key of keys) {
        const found = visit(record[key]);
        if (found) return found;
      }
    }
    return undefined;
  };

  for (const value of values) {
    const found = visit(value);
    if (found) return found;
  }
  return undefined;
};

export const parseOmniFlashExtTaskResponse = (
  payload: unknown,
  taskId?: string,
): OmniFlashExtTaskQueryResult => {
  const data = normalizeTaskPayload(payload, taskId);
  const result = data.result && typeof data.result === 'object' ? data.result : {};
  const taskResult =
    data.task_result && typeof data.task_result === 'object' ? data.task_result : {};
  const output = data.output && typeof data.output === 'object' ? data.output : {};

  const rawStatus = asTrimmedString(
    data.status ??
      data.state ??
      data.task_status ??
      data.taskStatus ??
      result.status ??
      taskResult.status,
  ).toLowerCase();

  const videoUrl = pickMediaUrl(
    [
      data.url,
      data.video_url,
      data.videoUrl,
      data.download_url,
      data.file_url,
      data.resource_url,
      data.videos,
      data.outputs,
      result.url,
      result.data,
      output,
      result.video_url,
      result.videoUrl,
      result.download_url,
      result.file_url,
      result.resource_url,
      result.videos,
      result.outputs,
      taskResult.video_url,
      taskResult.videoUrl,
      taskResult.download_url,
      taskResult.file_url,
      taskResult.resource_url,
      taskResult.videos,
      taskResult.outputs,
    ],
    'video',
  );
  const thumbnailUrl = pickMediaUrl(
    [
      data.thumbnail_url,
      data.thumbnailUrl,
      data.cover_image_url,
      data.cover_url,
      data.poster_url,
      result.thumbnail_url,
      result.thumbnailUrl,
      result.cover_image_url,
      result.cover_url,
      result.poster_url,
      result.videos,
      taskResult.thumbnail_url,
      taskResult.thumbnailUrl,
      taskResult.cover_image_url,
      taskResult.cover_url,
      taskResult.poster_url,
      taskResult.videos,
    ],
    'image',
  );

  if (videoUrl) {
    return { status: 'succeeded', rawStatus, videoUrl, thumbnailUrl };
  }

  if (
    ['failed', 'fail', 'error', 'cancelled', 'canceled', 'timeout', 'expired'].includes(
      rawStatus,
    )
  ) {
    return { status: 'failed', rawStatus, thumbnailUrl };
  }

  return { status: 'processing', rawStatus, thumbnailUrl };
};

const assertPersistableRefs = (label: string, refs: string[]) => {
  for (const ref of refs) {
    if (TEMP_REF_REGEX.test(ref) || BARE_BASE64_REGEX.test(ref) || !REMOTE_OR_MANAGED_REF_REGEX.test(ref)) {
      throw new BadRequestException(`${label}必须是可访问远程 URL 或正式资源引用`);
    }
  }
};

const normalizeResolution = (value: unknown): string => {
  const normalized = asTrimmedString(value).toUpperCase();
  if (normalized === '1080P') return '1080p';
  if (normalized === '4K') return '4k';
  return '720p';
};

const normalizeAspectRatio = (value: unknown): string => {
  const normalized = asTrimmedString(value);
  return normalized === '9:16' ? '9:16' : '16:9';
};

const normalizeDuration = (value: unknown): number => {
  const numeric = Number(value);
  const rounded = Number.isFinite(numeric) ? Math.round(numeric) : 6;
  return [4, 6, 8, 10].includes(rounded) ? rounded : 6;
};

const normalizeToapisDuration = (value: unknown): number => {
  const duration = normalizeDuration(value);
  if (duration === 8) return 10;
  return duration;
};

const normalizeToapisResolution = (resolution: string, aspectRatio: string): string => {
  const normalized = asTrimmedString(resolution).toLowerCase();
  const aspect = normalizeAspectRatio(aspectRatio);
  if (normalized === '1080p' && aspect === '16:9') {
    return '1080p';
  }
  return '720P';
};

const normalizeVideoMode = (value: unknown): OmniFlashExtVideoMode =>
  asTrimmedString(value).toLowerCase() === 'reference' ? 'reference' : 'frame';

export const collectOmniFlashExtMedia = (
  input: OmniFlashExtBuildInput,
): { imageUrls: string[]; videoUrls: string[] } => {
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];

  [
    input.referenceImages,
    input.images,
    input.image,
    input.metadata?.image_urls,
    input.metadata?.images,
    input.metadata?.image,
  ].forEach((source) => collectStrings(source).forEach((url) => pushUrl(imageUrls, url)));

  [
    input.referenceVideos,
    input.reference_videos,
    input.video_urls,
    input.metadata?.video_urls,
    input.metadata?.reference_videos,
  ].forEach((source) => collectStrings(source).forEach((url) => pushUrl(videoUrls, url)));

  const fromContent = collectFromContent(input.content);
  fromContent.imageUrls.forEach((url) => pushUrl(imageUrls, url));
  fromContent.videoUrls.forEach((url) => pushUrl(videoUrls, url));

  return { imageUrls, videoUrls };
};

export const buildOmniFlashExtNewApiPayload = (
  input: OmniFlashExtBuildInput,
): OmniFlashExtNewApiPayload => {
  const prompt = asTrimmedString(input.prompt);
  if (!prompt) {
    throw new BadRequestException('请先连接提示词，并确保内容不为空');
  }

  const { imageUrls, videoUrls } = collectOmniFlashExtMedia(input);
  if (imageUrls.length > 3) {
    throw new BadRequestException('参考图片最多支持 3 张');
  }
  if (videoUrls.length > 1) {
    throw new BadRequestException('参考视频最多支持 1 条');
  }

  assertPersistableRefs('Omni Flash Ext 参考图', imageUrls);
  assertPersistableRefs('Omni Flash Ext 参考视频', videoUrls);

  const hasReferenceVideo = videoUrls.length > 0;
  const requestedMode = normalizeVideoMode(input.videoMode);
  const effectiveMode: OmniFlashExtVideoMode = hasReferenceVideo
    ? 'reference'
    : imageUrls.length > 1
      ? 'reference'
      : requestedMode;

  if (effectiveMode === 'frame' && imageUrls.length > 1) {
    throw new BadRequestException('单图模式只能连接 1 张图片；如需多张图片，请切换到参考模式');
  }
  if (effectiveMode === 'reference' && imageUrls.length === 0 && !hasReferenceVideo) {
    throw new BadRequestException('参考模式至少需要 1 张参考图，或 1 条参考视频');
  }

  const payload: OmniFlashExtNewApiPayload = {
    model: OMNI_FLASH_EXT_MODEL_KEY,
    prompt,
    ...(imageUrls[0] ? { image: imageUrls[0], images: imageUrls } : {}),
    ...(hasReferenceVideo ? { reference_videos: [videoUrls[0]] } : {}),
    ...(!hasReferenceVideo ? { duration: normalizeDuration(input.duration) } : {}),
    resolution: normalizeResolution(input.resolution),
    aspect_ratio: normalizeAspectRatio(input.aspectRatio),
    metadata: {
      generation_type: effectiveMode,
      ...(hasReferenceVideo ? { video_urls: [videoUrls[0]] } : {}),
    },
    provider_options: {
      managedModelKey: OMNI_FLASH_EXT_MODEL_KEY,
      videoMode: effectiveMode,
    },
  };

  return payload;
};

export const buildOmniFlashExtToapisPayload = (
  input: OmniFlashExtBuildInput | OmniFlashExtNewApiPayload,
): OmniFlashExtToapisPayload => {
  const newApiPayload =
    (input as OmniFlashExtNewApiPayload).model === OMNI_FLASH_EXT_MODEL_KEY &&
    (input as OmniFlashExtNewApiPayload).metadata
      ? (input as OmniFlashExtNewApiPayload)
      : buildOmniFlashExtNewApiPayload(input as OmniFlashExtBuildInput);

  const imageUrls = Array.isArray(newApiPayload.images) ? newApiPayload.images : [];
  const videoUrls = Array.isArray(newApiPayload.metadata.video_urls)
    ? newApiPayload.metadata.video_urls
    : [];

  if (videoUrls.length > 0) {
    throw new BadRequestException(
      'ToAPIs gemini_omni_flash 暂不支持参考视频，请改用参考图片',
    );
  }
  if (imageUrls.length === 2) {
    throw new BadRequestException(
      'ToAPIs gemini_omni_flash 不支持 2 张参考图，请使用 1 张或 3 张',
    );
  }

  const payload: OmniFlashExtToapisPayload = {
    model: OMNI_FLASH_EXT_TOAPIS_MODEL,
    prompt: newApiPayload.prompt,
    aspect_ratio: newApiPayload.aspect_ratio,
    resolution: normalizeToapisResolution(
      newApiPayload.resolution,
      newApiPayload.aspect_ratio,
    ),
    duration: normalizeToapisDuration(newApiPayload.duration),
  };

  if (imageUrls.length > 0) {
    payload.image_urls = imageUrls.slice(0, 3);
  }

  return payload;
};

/** @deprecated 使用 buildOmniFlashExtToapisPayload */
export const buildOmniFlashExtApimartPayload = buildOmniFlashExtToapisPayload;
