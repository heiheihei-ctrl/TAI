export const VIDEO_ENHANCE_TOOL_VERSIONS = ["standard", "professional"] as const;
export const VIDEO_ENHANCE_SCENES = ["aigc", "ugc", "short_series", "old_film"] as const;
export const VIDEO_ENHANCE_RESOLUTION_MODES = ["preset", "limit"] as const;
export const VIDEO_ENHANCE_RESOLUTIONS = ["720p", "1080p", "2k", "4k"] as const;
export const VIDEO_ENHANCE_TASK_STATUSES = [
  "queued",
  "processing",
  "succeeded",
  "failed",
] as const;

export const VIDEO_ENHANCE_LIMIT_RANGE = {
  min: 64,
  max: 2160,
} as const;

export const VIDEO_ENHANCE_FPS_RANGE = {
  min: 1,
  max: 120,
} as const;

export const VIDEO_ENHANCE_POLL_INTERVAL_MS = 5000;
export const VIDEO_ENHANCE_MAX_POLLS = 180;
export const VIDEO_ENHANCE_HISTORY_LIMIT = 20;

