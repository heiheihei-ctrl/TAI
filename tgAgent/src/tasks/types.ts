/**
 * 生成任务源抽象 —— 对应 DESIGN.md §2 / §10 W1-②
 * mock 源用于全链路联调；tai 源等平台后端接口契约（待决⑤）后补齐实现。
 * 工具层只依赖本接口，切换实现不改结构。
 */

export interface GeneratedImage {
  url: string;
  width?: number;
  height?: number;
}

export interface ImageGenRequest {
  projectId: string;
  /** 已由 prompt 组装器合成好的完整正向提示词 */
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  imageSize?: string;
  /** 图生图参考（≤N张） */
  referenceImageUrls?: string[];
  /** 版本迭代的底图 */
  baseImageUrl?: string;
  /** 局部重绘遮罩（与 baseImageUrl 配套） */
  maskUrl?: string;
  /** 候选张数 1~4 */
  count: number;
}

export interface VideoGenRequest {
  projectId: string;
  prompt?: string;
  firstFrameUrl: string;
  lastFrameUrl?: string;
  motionPreset?: string;
  durationSec?: number;
}

export type ProgressFn = (stage: string, percent: number) => void;

/**
 * 生图结果：多候选并发时允许"部分成功"。
 * 已全部预扣积分的任务若因个别失败而整体抛错，等于白白丢图——
 * 因此只要有一张成功就正常返回，失败原因进 partialFailures 由调用方告知用户。
 */
export interface PartialFailure {
  message: string;
  /** TaskSourceError.code；上层据此映射协议错误码（auth_expired → auth_expired, insufficient_credits → quota_exceeded） */
  code?: "not_configured" | "submission_failed" | "timeout" | "cancelled" | "remote_error" | "auth_expired" | "insufficient_credits";
}

export interface ImageGenOutcome {
  images: GeneratedImage[];
  /** 逐任务的失败原因。空数组=全部成功。code 供工具层映射协议错误码 */
  partialFailures: PartialFailure[];
}

export interface VideoJobStatus {
  status: "queued" | "processing" | "done" | "failed" | "cancelled";
  progress: number;
  stage?: string;
  url?: string;
  error?: string;
}

export interface GenerationTaskSource {
  readonly name: string;
  /** 阻塞式出图（内部实现负责提交+等待+重试，超时由调用方控制）。
   *  仅当一张都没成功时才抛错；部分失败通过 partialFailures 返回。 */
  generateImages(req: ImageGenRequest, onProgress: ProgressFn): Promise<ImageGenOutcome>;
  /** 视频即发即忘，返回任务ID */
  submitVideoTask(req: VideoGenRequest): Promise<{ taskId: string }>;
  getVideoTask(taskId: string): Promise<VideoJobStatus>;
  cancelTask(taskId: string): Promise<void>;
  dispose?(): void;
  /** 为源绑定用户凭证（JWT 透传计费）。非计费源返回 this，TAI 源返回携带用户 JWT 的新实例。 */
  withUserAuth(bearer: string, teamId?: string): GenerationTaskSource;
}

export class TaskSourceError extends Error {
  constructor(
    message: string,
    /**
     * auth_expired = 401（token 无效/过期，前端应刷新后重试）；
     * insufficient_credits = 403（业务拒绝，典型为积分不足，提示用户）。
     * 这两类与普通远端错误的处理方式完全不同，不可混入 remote_error。
     */
    readonly code:
      | "not_configured"
      | "submission_failed"
      | "timeout"
      | "cancelled"
      | "remote_error"
      | "auth_expired"
      | "insufficient_credits",
  ) {
    super(message);
    this.name = "TaskSourceError";
  }
}
