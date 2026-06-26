import * as crypto from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';

export type TencentVodChannelConfig = {
  secretId: string;
  secretKey: string;
  sessionToken?: string;
  endpoint: string;
  region?: string;
  apiVersion: string;
  subAppId: number;
  timeoutMs: number;
};

type TencentVodFileInfo = {
  type: 'Url';
  category: 'Image' | 'Video';
  url: string;
  objectId?: string;
  usage: 'Reference';
  referenceType?: 'feature' | 'base';
  keepOriginalSound?: 'Enabled' | 'Disabled';
};

type TencentVodCreateVideoTaskRequest = {
  SubAppId: number;
  ModelName: 'Kling';
  ModelVersion: '3.0';
  Prompt?: string;
  FileInfos?: TencentVodFileInfo[];
  OutputConfig: {
    StorageMode: 'Temporary';
    AspectRatio?: string;
    Duration?: number;
    Resolution?: string;
    AudioGeneration?: 'Enabled' | 'Disabled';
  };
  EnhancePrompt: 'Enabled';
};

export type TencentVodQueryResult = {
  upstreamStatus: string;
  normalizedStatus: 'queued' | 'processing' | 'succeeded' | 'failed';
  videoUrl?: string;
  fileId?: string;
  response: Record<string, unknown>;
};

const asTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const normalizeHttpUrl = (value: string): string | undefined => {
  const raw = value.trim();
  if (!raw) return undefined;

  let candidate = raw;
  if (candidate.startsWith('//')) {
    candidate = `https:${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
};

const collectReferenceImages = (value: unknown): string[] => {
  const input = Array.isArray(value) ? value : [];
  return input
    .map((item) =>
      typeof item === 'string'
        ? item
        : item && typeof item === 'object' && !Array.isArray(item)
          ? asTrimmedString((item as Record<string, unknown>).url)
          : '',
    )
    .map((item) => normalizeHttpUrl(item || ''))
    .filter((item): item is string => Boolean(item));
};

const normalizeReferenceVideoType = (value: unknown): 'feature' | 'base' =>
  asTrimmedString(value).toLowerCase() === 'base' ? 'base' : 'feature';

const normalizeKeepOriginalSound = (value: unknown): 'Enabled' | 'Disabled' =>
  asTrimmedString(value).toLowerCase() === 'yes' ? 'Enabled' : 'Disabled';

const normalizeAudioGeneration = (
  sound: unknown,
  mode: unknown,
  hasReferenceVideo: boolean,
): 'Enabled' | 'Disabled' => {
  const normalizedSound = asTrimmedString(sound).toLowerCase();
  if (normalizedSound === 'on') return hasReferenceVideo ? 'Disabled' : 'Enabled';
  if (normalizedSound === 'off') return 'Disabled';
  return asTrimmedString(mode).toLowerCase() === 'pro' && !hasReferenceVideo
    ? 'Enabled'
    : 'Disabled';
};

const normalizeDuration = (value: unknown): number => {
  const numeric = Number(value);
  const rounded = Number.isFinite(numeric) ? Math.round(numeric) : 5;
  return Math.max(3, Math.min(15, rounded));
};

const normalizeResolution = (value: unknown, mode: unknown): string => {
  const raw = asTrimmedString(value).toUpperCase();
  if (raw) return raw;
  return asTrimmedString(mode).toLowerCase() === 'pro' ? '1080P' : '720P';
};

export function buildKling30TencentCreatePayload(metadata: Record<string, unknown>): TencentVodCreateVideoTaskRequest {
  const prompt = asTrimmedString(metadata.prompt);
  const referenceImages = collectReferenceImages(metadata.referenceImages);
  const referenceVideo = normalizeHttpUrl(asTrimmedString(metadata.referenceVideo) || '');

  if (!prompt && referenceImages.length === 0 && !referenceVideo) {
    throw new AppException(
      'INVALID_VIDEO_REQUEST',
      'Tencent Kling 3.0 requires prompt or media reference',
      HttpStatus.BAD_REQUEST,
    );
  }

  const fileInfos: TencentVodFileInfo[] = [];
  referenceImages.forEach((url, index) => {
    fileInfos.push({
      type: 'Url',
      category: 'Image',
      url,
      objectId: `id${index + 1}`,
      usage: 'Reference',
    });
  });

  if (referenceVideo) {
    fileInfos.push({
      type: 'Url',
      category: 'Video',
      url: referenceVideo,
      usage: 'Reference',
      referenceType: normalizeReferenceVideoType(metadata.referenceVideoType),
      keepOriginalSound: normalizeKeepOriginalSound(metadata.keepOriginalSound),
    });
  }

  return {
    SubAppId: Number(metadata.subAppId),
    ModelName: 'Kling',
    ModelVersion: '3.0',
    ...(prompt ? { Prompt: prompt } : {}),
    ...(fileInfos.length > 0 ? { FileInfos: fileInfos } : {}),
    OutputConfig: {
      StorageMode: 'Temporary',
      ...(asTrimmedString(metadata.aspectRatio) ? { AspectRatio: asTrimmedString(metadata.aspectRatio) } : {}),
      Duration: normalizeDuration(metadata.duration),
      Resolution: normalizeResolution(metadata.resolution, metadata.mode),
      AudioGeneration: normalizeAudioGeneration(
        metadata.sound,
        metadata.mode,
        Boolean(referenceVideo),
      ),
    },
    EnhancePrompt: 'Enabled',
  };
}

export function normalizeTencentVodStatus(status?: string): 'queued' | 'processing' | 'succeeded' | 'failed' {
  const value = asTrimmedString(status).toLowerCase();
  if (!value) return 'processing';
  if (['waiting', 'queued', 'pending', 'processing', 'running'].includes(value)) return 'processing';
  if (
    ['finish', 'finished', 'success', 'succeed', 'succeeded', 'completed', 'complete', 'done'].includes(
      value,
    )
  ) {
    return 'succeeded';
  }
  if (['failed', 'fail', 'error', 'cancel', 'cancelled', 'exception', 'timeout'].includes(value)) {
    return 'failed';
  }
  return 'processing';
}

export function extractTencentVodStatus(response: Record<string, unknown>): string {
  const candidates = [
    response.Status,
    response.TaskStatus,
    asRecord(response.ProcedureTask).Status,
    asRecord(response.TaskDetail).Status,
    asRecord(response.TaskDetail).TaskStatus,
    asRecord(response.TaskInfo).Status,
    asRecord(response.AigcVideoTask).Status,
    asRecord(response.AIGCVideoTask).Status,
  ];
  return candidates.map(asTrimmedString).find(Boolean) || '';
}

function collectUrlCandidates(root: unknown): Array<{ keyPath: string; url: string }> {
  const results: Array<{ keyPath: string; url: string }> = [];

  const walk = (value: unknown, keyPath: string): void => {
    if (typeof value === 'string') {
      const normalized = normalizeHttpUrl(value);
      if (normalized) {
        results.push({ keyPath, url: normalized });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${keyPath}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      walk(nested, keyPath ? `${keyPath}.${key}` : key);
    }
  };

  walk(root, '');
  return results;
}

function scoreVideoUrlCandidate(keyPath: string, url: string): number {
  let score = 0;
  const key = keyPath.toLowerCase();
  const value = url.toLowerCase();

  if (key.includes('fileurl')) score += 6;
  if (key.includes('video')) score += 4;
  if (key.includes('proceduretask')) score += 3;
  if (key.includes('output')) score += 2;
  if (key.includes('image')) score -= 4;
  if (key.includes('input') || key.includes('source')) score -= 5;
  if (/\.(mp4|mov|webm|m3u8)(\?|$)/i.test(value)) score += 4;
  if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(value)) score -= 4;

  return score;
}

export function extractTencentVodVideoUrl(response: Record<string, unknown>): string | undefined {
  const scored = collectUrlCandidates(response)
    .map((item) => ({ ...item, score: scoreVideoUrlCandidate(item.keyPath, item.url) }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].url : undefined;
}

export function extractTencentVodFileId(response: Record<string, unknown>): string | undefined {
  const queue: unknown[] = [response];
  const visited = new Set<unknown>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (key.toLowerCase() === 'fileid' && typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }
  return undefined;
}

export function buildTencentVodAuthorization(
  config: TencentVodChannelConfig,
  action: string,
  payload: string,
  timestamp: number,
  date: string,
): string {
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\n` +
    `host:${config.endpoint}\n` +
    `x-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
  const credentialScope = `${date}/vod/tc3_request`;
  const stringToSign =
    `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

  const secretDate = crypto.createHmac('sha256', `TC3${config.secretKey}`).update(date).digest();
  const secretService = crypto.createHmac('sha256', secretDate).update('vod').digest();
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

  return (
    `TC3-HMAC-SHA256 Credential=${config.secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
}
