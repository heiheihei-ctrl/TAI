import { randomUUID } from "node:crypto";
import { defineTool, Type } from "../piCompat.js";
import { TaskSourceError } from "../../tasks/types.js";
import { mapTaskSourceErrorToProtocol } from "../../shared/protocol.js";
import type { ToolContext } from "./context.js";

/** 运镜模式 → TAI provider prompt 描述（中文+英文双轨，确保模型语义理解） */
export const MOTION_PRESET_DESCRIPTIONS: Record<string, string> = {
  "orbit-left": "camera orbits slowly to the left around the architecture, circular leftward path, architectural walkthrough",
  "orbit-right": "camera orbits slowly to the right around the architecture, circular rightward path, architectural walkthrough",
  "orbit-top": "camera orbits from a high top-down angle descending toward the building, bird's-eye circling movement",
  "push-in": "camera pushes in / dolly in toward the building facade, steady forward movement, increasing proximity",
  "pull-out": "camera pulls back / dolly out revealing more context, steady backward movement, establishing shot",
  "dolly-zoom": "dolly zoom / vertigo effect, camera moves forward while zooming out, dramatic perspective shift, Hitchcockian",
  "crane-up": "crane shot moving upward, vertical ascent revealing the full building and surrounding context, aerial reveal",
  "fly-through": "fly-through camera moving through the architecture, entering the space, immersive walkthrough experience",
  "pan-left": "camera pans smoothly to the left, horizontal leftward sweep revealing adjacent facade sections",
  "pan-right": "camera pans smoothly to the right, horizontal rightward sweep revealing adjacent facade sections",
  "static-timelapse": "static camera timelapse, fixed position, clouds and light shifting over time, day-to-night transition",
};

/** 工具返回 details 统一形状（pi 的 AgentToolResult 泛型推断要求分支一致） */
interface VideoToolDetails {
  jobId?: string;
  taskId?: string;
  estimatedSeconds?: number;
}

function videoResult(text: string, details: VideoToolDetails = {}): {
  content: { type: "text"; text: string }[];
  details: VideoToolDetails;
} {
  return { content: [{ type: "text", text }], details };
}

export function createGenerateVideoTool(ctx: ToolContext) {
  return defineTool({
    name: "generate_video",
    label: "生成方案视频",
    description:
      "将一张已存在的效果图制作为动态视频（异步任务，提交后立即返回）。" +
      "必须传已有效果图的资产ID作为首帧，禁止在没有底图时凭空生成视频。" +
      "运镜模式与尾帧二选一；提交后告知用户预计时长即可，不要反复催询进度。",
    parameters: Type.Object({
      baseFrameAssetId: Type.String({ description: "首帧效果图资产ID（必须真实存在）" }),
      lastFrameAssetId: Type.Optional(
        Type.String({ description: "尾帧资产ID（首尾帧过渡，用于方案A→B演示）；与运镜互斥" }),
      ),
      motionPreset: Type.Optional(
        Type.Union(
          [
            Type.Literal("orbit-left"),
            Type.Literal("orbit-right"),
            Type.Literal("orbit-top"),
            Type.Literal("push-in"),
            Type.Literal("pull-out"),
            Type.Literal("dolly-zoom"),
            Type.Literal("crane-up"),
            Type.Literal("fly-through"),
            Type.Literal("pan-left"),
            Type.Literal("pan-right"),
            Type.Literal("static-timelapse"),
          ],
          { description: "运镜模式：左环绕/右环绕/俯视环绕/推近/拉远/推拉变焦/升轨/穿行/左平移/右平移/固定机位延时" },
        ),
      ),
      durationSec: Type.Optional(Type.Integer({ minimum: 5, maximum: 15, description: "时长5~15秒" })),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        baseFrameAssetId: string;
        lastFrameAssetId?: string;
        motionPreset?: "orbit-left" | "orbit-right" | "orbit-top" | "push-in" | "pull-out" | "dolly-zoom" | "crane-up" | "fly-through" | "pan-left" | "pan-right" | "static-timelapse";
        durationSec?: number;
      },
      _signal?: AbortSignal,
      _onUpdate?: unknown,
      _piCtx?: unknown,
    ) => {
      // ── 铁律①：底图必须存在 ──
      const firstFrame = ctx.assets.require(params.baseFrameAssetId);
      const lastFrame = params.lastFrameAssetId
        ? ctx.assets.require(params.lastFrameAssetId)
        : undefined;
      if (params.lastFrameAssetId && params.motionPreset) {
        return videoResult("运镜模式与尾帧过渡互斥：请确认用户想要哪一种后重新调用（传其一即可）。");
      }

      const brief = ctx.getBrief();
      const motionDesc = params.motionPreset ? MOTION_PRESET_DESCRIPTIONS[params.motionPreset] : undefined;
      const videoPrompt = [
        brief.projectType ? `Architectural ${brief.projectType}` : "",
        brief.styleKeywords.length ? brief.styleKeywords.join(", ") : "",
        brief.lighting ? `lighting: ${brief.lighting}` : "",
        motionDesc ?? "",
      ].filter(Boolean).join(". ") || "architectural visualization";

      let taskId: string;
      try {
        ({ taskId } = await ctx.taskSource.submitVideoTask({
          projectId: ctx.projectId,
          firstFrameUrl: firstFrame.url,
          lastFrameUrl: lastFrame?.url,
          motionPreset: params.motionPreset,
          durationSec: params.durationSec ?? 10,
          prompt: videoPrompt,
        }));
      } catch (err) {
        if (err instanceof TaskSourceError) {
          const { code, message } = mapTaskSourceErrorToProtocol(err);
          ctx.emit({ type: "error", sessionId: ctx.sessionId, code, message });
        }
        throw err;
      }

      const jobId = `job_${randomUUID().slice(0, 12)}`;
      ctx.videoJobs.register({
        id: jobId,
        projectId: ctx.projectId,
        kind: "video",
        remoteTaskId: taskId,
        params: {
          baseFrameAssetId: params.baseFrameAssetId,
          lastFrameAssetId: params.lastFrameAssetId,
          motionPreset: params.motionPreset,
          durationSec: params.durationSec ?? 10,
        },
        status: "processing",
        progress: 0,
        stage: "submitted",
        resultAssetIds: [],
        createdAt: new Date().toISOString(),
      });

      ctx.emit({
        type: "job.accepted",
        sessionId: ctx.sessionId,
        job: ctx.videoJobs.get(jobId)!,
      });

      const est = Math.round((params.durationSec ?? 10) * 4); // 经验值：约4倍时长
      return videoResult(
        `视频任务已提交（jobId=${jobId}，taskId=${taskId}）。首帧: ${firstFrame.url}` +
          `${lastFrame ? `，尾帧: ${lastFrame.url}` : ""}。预计约 ${est} 秒完成，完成后将自动出现在画布上，请告知用户耐心等待。`,
        { jobId, taskId, estimatedSeconds: est },
      );
    },
  });
}
