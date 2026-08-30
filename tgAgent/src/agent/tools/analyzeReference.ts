import { defineTool, Type } from "../piCompat.js";
import type { ToolContext } from "./context.js";

interface AnalysisResult {
  assetId: string;
  style?: string;
  materials?: string[];
  lighting?: string;
  camera?: string;
  mood?: string;
  context?: string;
  summary: string;
}

interface AnalyzeDetails {
  results: AnalysisResult[];
}

export function createAnalyzeReferenceTool(ctx: ToolContext) {
  return defineTool({
    name: "analyze_reference",
    label: "分析参考图",
    description:
      "对用户上传的参考图/草图/基地照片做结构化视觉分析。图片已在你的视觉上下文中，" +
      "你直接描述你看到的内容即可。适用场景：①用户一次上传多张参考图（>3 张分批）" +
      "②需要从竞品案例中提取风格/材质/光照等结构化属性 ③基地照片的环境肌理分析。" +
      "分析结果可用于更新设计档案（update_design_brief）。" +
      "assetIds 必须是当前会话中真实存在的资产 ID。",
    parameters: Type.Object({
      assetIds: Type.Array(
        Type.String(),
        { description: "要分析的资产 ID 列表（1~6 张，必须真实存在）", minItems: 1, maxItems: 6 },
      ),
      focus: Type.Optional(
        Type.Union(
          [
            Type.Literal("comprehensive"),
            Type.Literal("style"),
            Type.Literal("materials"),
            Type.Literal("lighting"),
            Type.Literal("context"),
            Type.Literal("camera"),
          ],
          { description: "分析聚焦维度：comprehensive=全维度 / style=风格基调 / materials=材质 / lighting=光照 / context=环境语境 / camera=视角" },
        ),
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: { assetIds: string[]; focus?: string },
      _signal?: AbortSignal,
      _onUpdate?: unknown,
      _piCtx?: unknown,
    ) => {
      // ── 铁律①：资产引用服务端校验 ──
      const assets = params.assetIds.map((id) => ctx.assets.require(id));

      const focusLabel = {
        comprehensive: "全维度",
        style: "风格基调",
        materials: "材质",
        lighting: "光照",
        context: "环境语境",
        camera: "视角",
      }[params.focus ?? "comprehensive"] ?? "全维度";

      // 构建结构化分析结果（LLM 基于已见的图片内容填充）
      const results: AnalysisResult[] = assets.map((a) => ({
        assetId: a.id,
        summary: `（待 LLM 基于视觉上下文分析 ${a.id}）`,
      }));

      const resultText = results
        .map(
          (r, i) =>
            `[${i + 1}] 资产 ${r.assetId}（${focusLabel}分析）:\n` +
            `  风格: ${r.style ?? "待分析"}\n` +
            `  材质: ${r.materials?.join("、") ?? "待分析"}\n` +
            `  光照: ${r.lighting ?? "待分析"}\n` +
            `  视角: ${r.camera ?? "待分析"}\n` +
            `  氛围: ${r.mood ?? "待分析"}\n` +
            `  环境: ${r.context ?? "待分析"}\n` +
            `  摘要: ${r.summary}`,
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text:
              `参考图分析完成（${focusLabel}，${assets.length} 张）:\n\n${resultText}\n\n` +
              `如需将分析结果写入需求档案，请调用 update_design_brief 并注明 reason="analyze_reference 提取"。`,
          },
        ],
        details: { results } satisfies AnalyzeDetails,
      };
    },
  });
}
