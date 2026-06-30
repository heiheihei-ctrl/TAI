export const VOLC_VIDEO_ENHANCE_MODEL = 'volc-enhance-video';
export const VOLC_VIDEO_ENHANCE_SERVICE_TYPE = 'volc-enhance-video';

export const VOLC_VIDEO_ENHANCE_TOOL_VERSIONS = ['standard', 'professional'] as const;
export const VOLC_VIDEO_ENHANCE_SCENES = ['aigc', 'ugc', 'short_series', 'old_film'] as const;
export const VOLC_VIDEO_ENHANCE_RESOLUTION_MODES = ['preset', 'limit'] as const;
export const VOLC_VIDEO_ENHANCE_PRESET_RESOLUTIONS = ['720p', '1080p', '2k', '4k'] as const;
export const VOLC_VIDEO_ENHANCE_PUBLIC_STATUSES = [
  'queued',
  'processing',
  'succeeded',
  'failed',
] as const;

export type VolcVideoEnhanceToolVersion =
  (typeof VOLC_VIDEO_ENHANCE_TOOL_VERSIONS)[number];
export type VolcVideoEnhanceScene = (typeof VOLC_VIDEO_ENHANCE_SCENES)[number];
export type VolcVideoEnhanceResolutionMode =
  (typeof VOLC_VIDEO_ENHANCE_RESOLUTION_MODES)[number];
export type VolcVideoEnhancePresetResolution =
  (typeof VOLC_VIDEO_ENHANCE_PRESET_RESOLUTIONS)[number];
export type VolcVideoEnhancePublicStatus =
  (typeof VOLC_VIDEO_ENHANCE_PUBLIC_STATUSES)[number];

export type VolcVideoEnhanceBillingResolution = '720P' | '1080P' | '2K' | '4K';
export type VolcVideoEnhanceFpsTier = 'lte30' | 'gt30';

export const VOLC_VIDEO_ENHANCE_POLL_INTERVAL_MS = 5_000;
export const VOLC_VIDEO_ENHANCE_MAX_POLLS = 180;
export const VOLC_VIDEO_ENHANCE_TIMEOUT_MS =
  VOLC_VIDEO_ENHANCE_POLL_INTERVAL_MS * VOLC_VIDEO_ENHANCE_MAX_POLLS;

export const VOLC_VIDEO_ENHANCE_LIMIT_RANGE = {
  min: 64,
  max: 2160,
} as const;

export const VOLC_VIDEO_ENHANCE_FPS_RANGE = {
  min: 1,
  max: 120,
} as const;

export const VOLC_VIDEO_ENHANCE_PRICE_MATRIX: Record<
  VolcVideoEnhanceToolVersion,
  Record<VolcVideoEnhanceBillingResolution, Record<VolcVideoEnhanceFpsTier, number>>
> = {
  standard: {
    '720P': { lte30: 90, gt30: 180 },
    '1080P': { lte30: 180, gt30: 360 },
    '2K': { lte30: 360, gt30: 720 },
    '4K': { lte30: 720, gt30: 1440 },
  },
  professional: {
    '720P': { lte30: 750, gt30: 1500 },
    '1080P': { lte30: 1500, gt30: 3000 },
    '2K': { lte30: 3000, gt30: 6000 },
    '4K': { lte30: 6000, gt30: 12000 },
  },
};

export const VOLC_VIDEO_ENHANCE_RESOLUTION_LABELS: Record<
  VolcVideoEnhancePresetResolution,
  VolcVideoEnhanceBillingResolution
> = {
  '720p': '720P',
  '1080p': '1080P',
  '2k': '2K',
  '4k': '4K',
};

export function resolveVolcVideoEnhanceBillingResolution(input: {
  resolution?: string | null;
  resolutionLimit?: number | null;
}): VolcVideoEnhanceBillingResolution {
  const preset = typeof input.resolution === 'string' ? input.resolution.trim().toLowerCase() : '';
  if (preset && preset in VOLC_VIDEO_ENHANCE_RESOLUTION_LABELS) {
    return VOLC_VIDEO_ENHANCE_RESOLUTION_LABELS[
      preset as VolcVideoEnhancePresetResolution
    ];
  }

  const limit = Number(input.resolutionLimit);
  if (Number.isFinite(limit)) {
    if (limit <= 720) return '720P';
    if (limit <= 1080) return '1080P';
    if (limit <= 1440) return '2K';
    return '4K';
  }

  return '1080P';
}

export function resolveVolcVideoEnhanceFpsTier(
  fps?: number | null,
): VolcVideoEnhanceFpsTier {
  const value = Number(fps);
  return Number.isFinite(value) && value > 30 ? 'gt30' : 'lte30';
}

