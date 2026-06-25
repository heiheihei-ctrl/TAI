import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';

export const OMNI_FLASH_EXT_MODEL_KEY = 'omni-flash-ext';
export const OMNI_FLASH_EXT_APIMART_MODEL = 'Omni-Flash-Ext';

type OmniFlashExtVideoMode = 'frame' | 'reference';

type OmniFlashExtBuildInput = {
  prompt?: string;
  metadata?: Record<string, unknown>;
};

type OmniFlashExtApimartPayload = {
  model: typeof OMNI_FLASH_EXT_APIMART_MODEL;
  prompt: string;
  image_urls: string[];
  video_urls?: string[];
  generation_type: OmniFlashExtVideoMode;
  duration?: number;
  resolution: string;
  aspect_ratio: string;
};

type OmniFlashExtTaskQueryResult = {
  status: 'processing' | 'succeeded' | 'failed';
  rawStatus: string;
  videoUrl?: string;
  thumbnailUrl?: string;
};

const REMOTE_OR_MANAGED_REF_REGEX =
  /^(https?:\/\/|projects\/|uploads\/|templates\/|videos\/|ai\/|asset:\/\/)/i;
const TEMP_REF_REGEX = /^(blob:|data:)/i;
const BARE_BASE64_REGEX = /^[A-Za-z0-9+/=]{80,}$/;

const asTrimmedString = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

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

const collectFromContent = (content: unknown): { imageUrls: string[]; videoUrls: string[] } => {
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const list = Array.isArray(content) ? content : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const type = asTrimmedString(record.type).toLowerCase();
    if (type === 'image_url') {
      collectStrings(record.image_url).forEach((url) => pushUrl(imageUrls, url));
    } else if (type === 'video_url') {
      collectStrings(record.video_url).forEach((url) => pushUrl(videoUrls, url));
    }
  }
  return { imageUrls, videoUrls };
};

const assertPersistableRefs = (label: string, refs: string[]) => {
  for (const ref of refs) {
    if (
      TEMP_REF_REGEX.test(ref) ||
      BARE_BASE64_REGEX.test(ref) ||
      !REMOTE_OR_MANAGED_REF_REGEX.test(ref)
    ) {
      throw new AppException(
        'INVALID_MEDIA_REFERENCE',
        `${label} must be a remote URL or managed asset reference`,
        HttpStatus.BAD_REQUEST,
      );
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

const normalizeVideoMode = (value: unknown): OmniFlashExtVideoMode =>
  asTrimmedString(value).toLowerCase() === 'reference' ? 'reference' : 'frame';

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

const normalizeTaskPayload = (payload: unknown, taskId?: string): Record<string, unknown> => {
  const root = toRecord(payload);
  const data = root.data;
  if (Array.isArray(data)) {
    const records = data.filter(
      (item): item is Record<string, unknown> =>
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

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data === root ? root : { ...root, ...(data as Record<string, unknown>) };
  }

  return root;
};

export function isOmniFlashExtModelKey(value: unknown): boolean {
  return asTrimmedString(value).toLowerCase().replace(/_/g, '-') === OMNI_FLASH_EXT_MODEL_KEY;
}

export function buildOmniFlashExtApimartPayload(
  input: OmniFlashExtBuildInput,
): OmniFlashExtApimartPayload {
  const prompt = asTrimmedString(input.prompt);
  if (!prompt) {
    throw new AppException(
      'INVALID_VIDEO_PROMPT',
      'Omni Flash Ext requires a non-empty prompt',
      HttpStatus.BAD_REQUEST,
    );
  }

  const metadata = toRecord(input.metadata);
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];

  [
    metadata.referenceImages,
    metadata.images,
    metadata.image,
    metadata.image_urls,
    metadata.reference_images,
  ].forEach((source) => collectStrings(source).forEach((url) => pushUrl(imageUrls, url)));

  [
    metadata.referenceVideo,
    metadata.referenceVideos,
    metadata.reference_videos,
    metadata.video_urls,
  ].forEach((source) => collectStrings(source).forEach((url) => pushUrl(videoUrls, url)));

  const fromContent = collectFromContent(metadata.content);
  fromContent.imageUrls.forEach((url) => pushUrl(imageUrls, url));
  fromContent.videoUrls.forEach((url) => pushUrl(videoUrls, url));

  if (imageUrls.length > 3) {
    throw new AppException(
      'INVALID_MEDIA_REFERENCE',
      'Omni Flash Ext supports at most 3 reference images',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (videoUrls.length > 1) {
    throw new AppException(
      'INVALID_MEDIA_REFERENCE',
      'Omni Flash Ext supports at most 1 reference video',
      HttpStatus.BAD_REQUEST,
    );
  }

  assertPersistableRefs('Omni Flash Ext reference images', imageUrls);
  assertPersistableRefs('Omni Flash Ext reference videos', videoUrls);

  const hasReferenceVideo = videoUrls.length > 0;
  const requestedMode = normalizeVideoMode(metadata.videoMode);
  const effectiveMode: OmniFlashExtVideoMode = hasReferenceVideo
    ? 'reference'
    : imageUrls.length >= 2
      ? 'reference'
      : requestedMode;

  if (effectiveMode === 'frame' && imageUrls.length > 1) {
    throw new AppException(
      'INVALID_MEDIA_REFERENCE',
      'Omni Flash Ext frame mode accepts only one image',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (effectiveMode === 'reference' && imageUrls.length === 0) {
    throw new AppException(
      'INVALID_MEDIA_REFERENCE',
      'Omni Flash Ext reference mode requires at least one image',
      HttpStatus.BAD_REQUEST,
    );
  }

  return {
    model: OMNI_FLASH_EXT_APIMART_MODEL,
    prompt,
    image_urls: imageUrls.slice(0, 3),
    ...(videoUrls[0] ? { video_urls: [videoUrls[0]] } : {}),
    generation_type: effectiveMode,
    ...(!videoUrls[0] ? { duration: normalizeDuration(metadata.duration) } : {}),
    resolution: normalizeResolution(metadata.resolution),
    aspect_ratio: normalizeAspectRatio(metadata.aspectRatio),
  };
}

export function parseOmniFlashExtTaskResponse(
  payload: unknown,
  taskId?: string,
): OmniFlashExtTaskQueryResult {
  const data = normalizeTaskPayload(payload, taskId);
  const result = toRecord(data.result);
  const taskResult = toRecord(data.task_result);
  const output = toRecord(data.output);

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
      data.video_url,
      data.videoUrl,
      data.download_url,
      data.file_url,
      data.resource_url,
      data.videos,
      data.outputs,
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
}
