import type {
  VIDEO_ENHANCE_RESOLUTIONS,
  VIDEO_ENHANCE_RESOLUTION_MODES,
  VIDEO_ENHANCE_SCENES,
  VIDEO_ENHANCE_TASK_STATUSES,
  VIDEO_ENHANCE_TOOL_VERSIONS,
} from "@/constants/videoEnhance";

export type VideoEnhanceToolVersion =
  (typeof VIDEO_ENHANCE_TOOL_VERSIONS)[number];
export type VideoEnhanceScene = (typeof VIDEO_ENHANCE_SCENES)[number];
export type VideoEnhanceResolutionMode =
  (typeof VIDEO_ENHANCE_RESOLUTION_MODES)[number];
export type VideoEnhanceResolution = (typeof VIDEO_ENHANCE_RESOLUTIONS)[number];
export type VideoEnhanceTaskStatus =
  (typeof VIDEO_ENHANCE_TASK_STATUSES)[number];

export type VideoEnhanceNodeStatus = "idle" | "running" | "succeeded" | "failed";

export type VideoEnhanceTaskHistoryItem = {
  id: string;
  taskId: string;
  apiUsageId?: string;
  status: VideoEnhanceTaskStatus | "timeout";
  inputVideoUrl: string;
  outputVideoUrl?: string;
  error?: string;
  createdAt: number;
  finishedAt?: number;
  processingTime?: number;
  toolVersion: VideoEnhanceToolVersion;
  scene: VideoEnhanceScene;
  resolutionMode: VideoEnhanceResolutionMode;
  resolution?: VideoEnhanceResolution;
  resolutionLimit?: number;
  fps?: number;
};

export type VideoEnhanceNodeData = {
  status?: VideoEnhanceNodeStatus;
  error?: string;
  inputVideoUrl?: string;
  videoUrl?: string;
  taskId?: string;
  apiUsageId?: string;
  progress?: number;
  upstreamStatus?: string;
  toolVersion?: VideoEnhanceToolVersion;
  scene?: VideoEnhanceScene;
  resolutionMode?: VideoEnhanceResolutionMode;
  resolution?: VideoEnhanceResolution;
  resolutionLimit?: number;
  fps?: number;
  history?: VideoEnhanceTaskHistoryItem[];
  pendingTaskId?: string;
  pendingApiUsageId?: string;
  pendingStartMs?: number;
  processingTime?: number;
  boxW?: number;
  boxH?: number;
};

export type CreateVideoEnhanceTaskRequest = {
  videoUrl: string;
  toolVersion: VideoEnhanceToolVersion;
  scene: VideoEnhanceScene;
  resolution?: VideoEnhanceResolution;
  resolutionLimit?: number;
  fps?: number;
};

export type CreateVideoEnhanceTaskResponse = {
  success: boolean;
  taskId: string;
  apiUsageId: string;
  status: VideoEnhanceTaskStatus;
};

export type QueryVideoEnhanceTaskResponse = {
  success: boolean;
  taskId: string;
  status: VideoEnhanceTaskStatus;
  upstreamStatus?: string;
  videoUrl?: string;
  error?: string;
};

