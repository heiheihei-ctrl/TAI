export const VIDEO_COMPOSE_MIN_CLIP_US = 500_000;
export const VIDEO_COMPOSE_DEFAULT_FPS = 30;
export const VIDEO_COMPOSE_DEFAULT_TIMELINE_PX_PER_SECOND = 72;

export type VideoComposeSource = {
  id: string;
  url: string;
  trimStart: number;
  trimEnd: number;
  title: string;
  thumbnailUrl?: string;
};

export type VideoComposeAudioTrack = {
  url: string;
  title?: string;
  volume: number;
  loop: boolean;
  enabled: boolean;
};

export type VideoComposeDraftSegment = VideoComposeSource & {
  sourceDurationUs: number;
  sourceId: string;
};

export type VideoComposeUpstream = {
  videos: VideoComposeSource[];
  audio?: VideoComposeAudioTrack;
};

export type VideoComposeProgress =
  | { phase: "prepare"; progress: number; message?: string }
  | { phase: "output"; progress: number; message?: string }
  | { phase: "upload"; progress: number; message?: string };
