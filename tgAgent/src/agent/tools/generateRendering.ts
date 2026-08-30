import { randomUUID } from "node:crypto";
import { defineTool, Type } from "../piCompat.js";
import { buildImagePrompt, buildNegativePrompt } from "../promptAssembly.js";
import { CARD_H, CARD_W, layoutCandidates } from "../../canvas/layout.js";
import { TaskSourceError } from "../../tasks/types.js";
import { mapTaskSourceErrorToProtocol } from "../../shared/protocol.js";
import type { PartialFailure } from "../../tasks/types.js";
import type { ToolContext } from "./context.js";

const IMAGE_BLOCK_TIMEOUT_MS = 45_000; // < IMAGE_POLL_TIMEOUT_MS (90s)：保证 Promise.race 先释放工具线程，
// 超时降级为后台任务（DESIGN.md §4.3）。避免与轮询超时"谁先到不确定"导致实际任务被判失败。

/** 工具返回 details 统一形状（pi 的 AgentToolResult 泛型推断要求分支一致） */
interface RenderToolDetails {
  candidateAssetIds?: string[];
  prompt?: string;
  degraded?: boolean;
}

export function createGenerateRenderingTool(ctx: ToolContext) {
  return defineTool({
    name: "generate_rendering",
    label: "生成渲染效果图",
    description:
      "生成建筑渲染效果图（阻塞调用，通常几十秒）。出图前必须已调用 update_design_brief。" +
      "一次只调用一个生成类工具。候选默认2张（最多4张），会自动出现在画布上选区右侧。" +
      "用户对已有版本提出任何修改（材质/光照/视角/局部）＝必须重新调用本工具并带 inheritFromAssetId 指向该版本，" +
      "禁止只用文字回复修改建议而不执行；只有用户明确要求重新构图时才省略 inheritFromAssetId。" +
      "多张候选未指明底图时，取最新一批的第一张作为 inheritFromAssetId 直接执行，不要反问用户选哪张。" +
      "局部重绘需用户已通过画布框选提供区域。",
    parameters: Type.Object({
      directives: Type.Optional(
        Type.String({ description: "本次出图的增量描述（在需求档案基础上的补充/覆盖）" }),
      ),
      referenceAssetIds: Type.Optional(
        Type.Array(Type.String(), { description: "图生图参考资产ID（真实存在，≤3张）" }),
      ),
      inheritFromAssetId: Type.Optional(
        Type.String({ description: "版本迭代来源资产ID（保持构图连续性）" }),
      ),
      useRegion: Type.Optional(
        Type.Boolean({ description: "true=按用户框选的局部区域做局部重绘（选区必须存在）" }),
      ),
      candidateCount: Type.Optional(Type.Integer({ minimum: 1, maximum: 4 })),
      aspectRatio: Type.Optional(
        Type.Union(
          ["1:1", "3:4", "4:3", "2:3", "3:2", "4:5", "5:4", "9:16", "16:9", "21:9"].map((r) =>
            Type.Literal(r),
          ),
        ),
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        directives?: string;
        referenceAssetIds?: string[];
        inheritFromAssetId?: string;
        useRegion?: boolean;
        candidateCount?: number;
        aspectRatio?: string;
      },
      _signal?: AbortSignal,
      _onUpdate?: unknown,
      _piCtx?: unknown,
    ) => {
      if (process.env.TOOL_DEBUG) {
        console.log(`[tool] generate_rendering 进入, params=${JSON.stringify(params)}`);
      }
      // ── 铁律①：资产引用服务端校验（模型侧已约束，这里兜底）──
      const refIds = params.referenceAssetIds ?? [];
      for (const id of refIds) ctx.assets.require(id);
      const inherit = params.inheritFromAssetId
        ? ctx.assets.require(params.inheritFromAssetId)
        : undefined;
      if (params.useRegion && !inherit && ctx.currentSelection().length === 0) {
        return textResult(
          "局部重绘需要底图：请确认用户已框选画布图片区域，或传入 inheritFromAssetId。",
        );
      }

      // ── prompt 组装（§7.2）──
      const brief = ctx.getBrief();
      const prompt = buildImagePrompt(brief, { free: params.directives });
      const negative = buildNegativePrompt(brief);

      // ── 局部重绘底图：优先显式 inherit，其次当前选区 ──
      const selection = ctx.currentSelection();
      const regionBase = params.useRegion
        ? ctx.assets.require(params.inheritFromAssetId ?? selection[0]!.assetId)
        : undefined;

      const callId = `gr_${randomUUID().slice(0, 8)}`;
      const emitStatus = (state: "running" | "done" | "error", stage?: string, percent?: number) => {
        ctx.emit({
          type: "tool.status",
          sessionId: ctx.sessionId,
          callId,
          name: "generate_rendering",
          state,
          progress: stage !== undefined ? { stage, percent: percent ?? 0 } : undefined,
        });
      };
      emitStatus("running", "submitted", 5);
      if (process.env.TOOL_DEBUG) console.log("[tool] 状态已发: submitted");

      const onProgress = (stage: string, percent: number) => {
        if (process.env.TOOL_DEBUG) console.log(`[tool] 进度 ${stage} ${percent}%`);
        emitStatus("running", stage, percent);
      };

      // ── 提交生成（阻塞 + 超时降级）──
      const jobId = `job_${randomUUID().slice(0, 12)}`;
      const genPromise = ctx.taskSource.generateImages(
        {
          projectId: ctx.projectId,
          prompt,
          negativePrompt: negative,
          aspectRatio: params.aspectRatio ?? "16:9",
          imageSize: "1K",
          referenceImageUrls: refIds.map((id) => ctx.assets.require(id).url),
          baseImageUrl: inherit?.url ?? regionBase?.url,
          count: params.candidateCount ?? 2,
        },
        onProgress,
      );
      const timeout = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new TaskSourceError("生成超时", "timeout")), IMAGE_BLOCK_TIMEOUT_MS),
      );

      let outcome;
      try {
        outcome = await Promise.race([genPromise, timeout]);
      } catch (err) {
        const degraded = err instanceof TaskSourceError && err.code === "timeout";
        emitStatus(degraded ? "running" : "error");
        if (degraded) {
          // 降级：任务转后台，完成时经 canvas.place 推送（会话重连可恢复）
          // 使用独立 bgJobId 避免与前台 jobId 冲突
          const bgJobId = `job_${randomUUID().slice(0, 12)}_bg`;
          void genPromise.then((bgOutcome) => {
            placeAndEmit(ctx, bgOutcome.images, params, bgJobId);
            notifyPartialFailures(ctx, bgOutcome.partialFailures);
            emitStatus("done", "done", 100);
          }).catch((bgErr) => {
            emitStatus("error", "error", 100);
            const proto = bgErr instanceof TaskSourceError
              ? mapTaskSourceErrorToProtocol(bgErr)
              : { code: "generation_failed" as const, message: (bgErr as Error).message };
            ctx.emit({
              type: "error",
              sessionId: ctx.sessionId,
              code: proto.code,
              message: `后台生图任务失败: ${proto.message}`,
            });
          });
          return textResult("生成耗时超出预期，已转入后台继续。完成后会自动出现在画布上。", {
            degraded: true,
          });
        }
        if (err instanceof TaskSourceError) {
          const { code, message } = mapTaskSourceErrorToProtocol(err);
          ctx.emit({ type: "error", sessionId: ctx.sessionId, code, message });
        }
        throw err;
      }

      emitStatus("done", "done", 100);
      const cards = placeAndEmit(ctx, outcome.images, params, jobId);
      notifyPartialFailures(ctx, outcome.partialFailures);

      const failureNote = outcome.partialFailures.length
        ? `\n注意：另有 ${outcome.partialFailures.length} 个候选失败——${outcome.partialFailures.map((f) => f.message).join("；")}`
        : "";
      return textResult(
        `已生成 ${cards.length} 张候选（${params.aspectRatio ?? "16:9"}），已放置在画布上：\n` +
          cards
            .map((c, i) => `${i + 1}. assetId=${c.assetId} url=${c.url}`)
            .join("\n") +
          `\n父版本: ${inherit?.id ?? regionBase?.id ?? "无（全新方案）"}` +
          failureNote,
        { candidateAssetIds: cards.map((c) => c.assetId), prompt },
      );
    },
  });
}

function textResult(text: string, details: RenderToolDetails = {}): {
  content: { type: "text"; text: string }[];
  details: RenderToolDetails;
} {
  return { content: [{ type: "text", text }], details };
}

/** 多候选部分失败时通知用户：成功的图已上画布，失败原因单独提示（不整体报错）。
 *  若任一 failure 携带 auth/credit code，emit 对应协议码而非泛化 generation_failed */
function notifyPartialFailures(ctx: ToolContext, partialFailures: PartialFailure[]): void {
  if (!partialFailures.length) return;
  const authFail = partialFailures.find(
    (f) => f.code === "auth_expired" || f.code === "insufficient_credits",
  );
  if (authFail) {
    const proto = mapTaskSourceErrorToProtocol(new TaskSourceError(authFail.message, authFail.code!));
    ctx.emit({
      type: "error",
      sessionId: ctx.sessionId,
      code: proto.code,
      message: `部分候选生成失败（其余已正常出图）：${partialFailures.map((f) => f.message).join("；")}`,
    });
  } else {
    ctx.emit({
      type: "error",
      sessionId: ctx.sessionId,
      code: "generation_failed",
      message: `部分候选生成失败（其余已正常出图）：${partialFailures.map((f) => f.message).join("；")}`,
    });
  }
}

function placeAndEmit(
  ctx: ToolContext,
  images: { url: string; width?: number; height?: number }[],
  params: { inheritFromAssetId?: string; useRegion?: boolean; aspectRatio?: string },
  jobId: string,
) {
  const selection = ctx.currentSelection();
  const parentIds = [
    ...(params.inheritFromAssetId ? [params.inheritFromAssetId] : []),
    ...(params.useRegion && selection[0] ? [selection[0]!.assetId] : []),
  ];
  const anchorAsset = selection[0];

  const placements = layoutCandidates(
    {
      candidateCount: images.length,
      anchor: anchorAsset ? { x: anchorAsset.x, y: anchorAsset.y, width: anchorAsset.width } : undefined,
    },
    ctx.canvasOccupancy.get(),
  );
  ctx.canvasOccupancy.add(
    placements.map((p) => ({ x: p.pos.x, y: p.pos.y, w: CARD_W, h: CARD_H })),
  );

  const cards = images.map((img, i) => {
    const asset = ctx.assets.register({
      projectId: ctx.projectId,
      kind: "image",
      url: img.url,
      width: img.width,
      height: img.height,
      parentIds,
      operation: params.useRegion ? "inpaint" : parentIds.length ? "img2img" : "newVariant",
      meta: { aspectRatio: params.aspectRatio ?? "16:9" },
      createdByJobId: jobId,
    });
    return {
      assetId: asset.id,
      url: asset.url,
      thumbUrl: asset.thumbUrl,
      pos: placements[i]!.pos,
      parentIds,
      operation: asset.operation,
      style: "candidate" as const,
    };
  });

  ctx.emit({ type: "canvas.place", sessionId: ctx.sessionId, cards });
  return cards;
}
