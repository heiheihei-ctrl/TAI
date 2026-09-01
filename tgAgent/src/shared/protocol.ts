/**
 * 前后端 WebSocket 协议契约 —— 对应 DESIGN.md §5
 * 该文件是前后端的对接基准，字段变更需同步前端同学。
 *
 * 可靠性约定：
 * - 下行消息一律包裹 Downstream 信封，seq 单调递增；客户端断线重连时携带 lastSeq 补发
 * - 上行 message.send 携带 clientId，网关按 clientId 去重（幂等）
 * - 视频完成事件（asset.video_completed / canvas.place 由视频驱动）可能在 BFF 轮次结束后
 *   才到达（sessions.ts 视频轮询是跨轮次的）。彼时 BFF SSE 已关闭，事件进入 ring 缓冲；
 *   下一轮 BFF /chat 须携带 lastSeq 走 resync 补发，否则该视频完成事件不会重放。
 */

import type { Asset, AssetOperation, GenJob } from "./assets.js";
import type { DesignBrief } from "./brief.js";
import type { TaskSourceError } from "../tasks/types.js";

// ---------- 通用 ----------

/** 画布选区引用（随用户消息携带，[选区] 标记的数据来源） */
export interface SelectionRef {
  assetId: string;
  thumbUrl?: string;
  kind: Asset["kind"];
  /** 画布世界坐标（锚点落位用，前端上报） */
  x?: number;
  y?: number;
  width?: number;
  /** Shift+框选产生的局部区域（图片**像素**坐标），存在时表示局部重绘意图 */
  regionRect?: { x: number; y: number; w: number; h: number };
  /**
   * 局部区域（**归一化** 0–1），TAI 前端契约（`PreciseEditContext.cropRectNormalized`）。
   * 与 regionRect 二选一；两者并存时以本字段为准。
   * ⚠️ 该坐标**不发给 TAI 后端**（EditImageDto 无 crop/mask 字段）——模型收到的是原图整张，
   * 区域仅用于前端 canvas 合成与 prompt 描述。详见 shared/region.ts 顶部说明。
   */
  normalizedRegion?: import("./region.js").NormalizedRect;
  /** 图片像素尺寸：把 regionRect 换算为归一化时需要（取自 asset.width / asset.height） */
  imageWidth?: number;
  imageHeight?: number;
}

// ---------- client → server ----------

export interface MsgSend {
  type: "message.send";
  projectId: string;
  sessionId?: string;
  text: string;
  /** 随消息上传的图片（base64，≤3张，≤1024px），pi 原生视觉输入 */
  attachments?: { mediaType: string; data: string }[];
  selectionRefs?: SelectionRef[];
  /** 幂等去重键（UUID） */
  clientId: string;
  /** 客户端已知最新下行 seq（用于服务端判断是否需要补发 ring 缓冲中的遗漏事件） */
  lastSeq?: number;
}

export interface MsgSteer {
  type: "message.steer";
  sessionId: string;
  text: string;
}

export interface MsgInterrupt {
  type: "message.interrupt";
  sessionId: string;
}

export interface SelectionChanged {
  type: "selection.changed";
  projectId: string;
  /** 兼容字段：仅 ID 列表（无坐标时锚点落位退化为原点） */
  selectionIds?: string[];
  /** 推荐字段：带画布坐标的完整选区（新版候选的锚点落位用） */
  selectionRefs?: SelectionRef[];
}

export interface TaskCancel {
  type: "task.cancel";
  sessionId: string;
  taskId: string;
}

/** 多候选择优：设计师对候选卡标选定/弃用；同批兄弟自动弱化，选定卡自动成为当前选区 */
export interface CardMark {
  type: "card.mark";
  projectId: string;
  sessionId?: string;
  marks: {
    assetId: string;
    pick: "candidate" | "final" | "weak";
    /** 卡片画布坐标（选区锚点落位用） */
    rect?: { x: number; y: number; width: number };
  }[];
}

/** 前端删除画布卡片（软删除，resync 不再带回） */
export interface CardDelete {
  type: "card.delete";
  projectId: string;
  sessionId?: string;
  assetId: string;
}

/** 设计师手改需求档案（纠偏 agent 误理解的兜底，DESIGN.md §3.2） */
export interface BriefPatchMsg {
  type: "brief.patch";
  projectId: string;
  sessionId?: string;
  patch: import("./brief.js").DesignBriefPatch;
}

/** 设计师模式切换：对话模式 ↔ 设计模式（影响 brief 展示与工具可用性） */
export interface ModeToggleMsg {
  type: "mode.toggle";
  sessionId?: string;
  projectId: string;
  mode: "chat" | "design";
}

export interface SessionFork {
  type: "session.fork";
  projectId: string;
  sessionId: string;
}

export interface SessionSwitch {
  type: "session.switch";
  projectId: string;
  sessionId: string;
}

/** WS 鉴权（配置了 WS_TOKEN 时使用） */
export interface AuthMsg {
  type: "auth";
  token: string;
}

export interface Resync {
  type: "message.resync";
  sessionId?: string;
  /** 新连接按此路由到已有会话并挂载下行（页面刷新/断线重连恢复） */
  projectId?: string;
  lastSeq?: number;
}

export type UpstreamMessage =
  | MsgSend
  | MsgSteer
  | MsgInterrupt
  | SelectionChanged
  | TaskCancel
  | CardMark
  | CardDelete
  | BriefPatchMsg
  | ModeToggleMsg
  | SessionFork
  | SessionSwitch
  | AuthMsg
  | Resync;

// ---------- server → client ----------

export interface ConversationDelta {
  type: "conversation.delta";
  sessionId: string;
  delta: string;
}

export type ToolState = "running" | "done" | "error";

export interface ToolStatus {
  type: "tool.status";
  sessionId: string;
  callId: string;
  name: string;
  state: ToolState;
  progress?: { stage: string; percent: number };
}

export interface ModeChanged {
  type: "mode.changed";
  sessionId: string;
  mode: "chat" | "design";
}

/** 画布写指令：前端通过既有 command/undo 栈执行（React Flow 已证实） */
export interface CanvasPlace {
  type: "canvas.place";
  sessionId: string;
  cards: {
    assetId: string;
    url: string;
    thumbUrl?: string;
    /** 画布坐标（网关给出建议落位，前端可调整吸附） */
    pos: { x: number; y: number };
    parentIds: string[];
    operation: AssetOperation;
    style: "candidate" | "final";
  }[];
}

export interface CanvasUpdate {
  type: "canvas.update";
  sessionId: string;
  updates: {
    assetId: string;
    patch: Partial<Pick<Asset, "url" | "thumbUrl" | "pick" | "deleted">> & { markedWeak?: boolean };
  }[];
}

export interface VideoCompleted {
  type: "asset.video_completed";
  sessionId: string;
  jobId: string;
  asset: Asset;
}

export interface PresentationReady {
  type: "presentation.ready";
  sessionId: string;
  presentationId: string;
  url: string;
  totalPages: number;
}

export interface BriefUpdated {
  type: "brief.updated";
  sessionId: string;
  brief: DesignBrief;
}

export interface JobAccepted {
  type: "job.accepted";
  sessionId: string;
  job: GenJob;
}

export interface ErrorMessage {
  type: "error";
  sessionId?: string;
  code:
    | "rate_limited"
    | "quota_exceeded"
    | "auth_expired"
    | "generation_failed"
    | "not_configured"
    | "invalid_asset_ref"
    | "session_not_found"
    | "bad_request"
    | "internal";
  message: string;
}

export type ErrorCode = ErrorMessage["code"];

/** TaskSourceError.code → 协议 ErrorMessage.code + 面向用户文案 */
export function mapTaskSourceErrorToProtocol(
  err: TaskSourceError,
): { code: ErrorCode; message: string } {
  switch (err.code) {
    case "auth_expired":
      return { code: "auth_expired", message: `登录状态已过期，请刷新后重试：${err.message}` };
    case "insufficient_credits":
      return { code: "quota_exceeded", message: `积分不足或配额受限：${err.message}` };
    case "timeout":
      return { code: "generation_failed", message: `生成超时：${err.message}` };
    case "not_configured":
      // 配置/部署错误（缺环境变量、非法 provider、凭证互斥等）≠ 模型生成失败：
      // 用户重试不会恢复，单列错误码供前端提示"服务配置问题"并支持监控分流。
      return { code: "not_configured", message: `服务配置错误，请联系平台运维：${err.message}` };
    default:
      return { code: "generation_failed", message: err.message };
  }
}

/** 信封：seq 用于断线补发 */
export type DownstreamBody =
  | ConversationDelta
  | ToolStatus
  | CanvasPlace
  | CanvasUpdate
  | VideoCompleted
  | PresentationReady
  | BriefUpdated
  | ModeChanged
  | JobAccepted
  | ErrorMessage;

export interface Downstream {
  seq: number;
  body: DownstreamBody;
}

/** 重连补发：环形缓冲中的缺失消息 */
export interface ResyncBatch {
  type: "message.resync_batch";
  messages: Downstream[];
  /** true 表示缓冲已截断，建议全量刷新会话 */
  truncated: boolean;
}

export type ServerMessage = Downstream | ResyncBatch;
