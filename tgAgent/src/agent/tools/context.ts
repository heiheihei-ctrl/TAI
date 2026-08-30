/**
 * 工具运行上下文 —— 网关为每个 AgentSession 构造一份。
 * 工具通过它访问 brief/资产/任务源并向下行通道发事件，
 * 不直接触碰 WebSocket 与 pi，保证可测试性。
 */

import type { GenJob } from "../../shared/assets.js";
import type { DesignBrief, DesignBriefPatch } from "../../shared/brief.js";
import type { DownstreamBody } from "../../shared/protocol.js";
import type { AssetStore } from "../../assets/store.js";
import type { GenerationTaskSource } from "../../tasks/types.js";
import type { Rect } from "../../canvas/layout.js";

export interface VideoJobRegistry {
  register(job: GenJob): void;
  get(jobId: string): GenJob | undefined;
}

/** 会话内画布占用登记（落位避让用，内存版） */
export interface CanvasOccupancy {
  get(): Rect[];
  add(rects: Rect[]): void;
}

export interface ToolContext {
  readonly projectId: string;
  readonly sessionId: string;

  getBrief(): DesignBrief;
  /** 合并 patch、刷新时间戳并触发 brief.updated 下行 */
  applyBriefPatch(patch: DesignBriefPatch, reason: string): DesignBrief;

  readonly assets: AssetStore;
  readonly taskSource: GenerationTaskSource;
  readonly videoJobs: VideoJobRegistry;
  readonly canvasOccupancy: CanvasOccupancy;

  /** 最近一次上报的选区（解析后的资产），无选区为空数组 */
  currentSelection(): { assetId: string; x?: number; y?: number; width?: number; url: string }[];

  /** 下行事件（gateway 负责 seq 包装与补发缓冲） */
  emit(body: DownstreamBody): void;
}
