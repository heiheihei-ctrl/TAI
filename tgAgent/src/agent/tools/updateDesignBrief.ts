import { defineTool, Type } from "../piCompat.js";
import { summarizeBrief } from "../promptAssembly.js";
import type { DesignBrief, DesignBriefPatch } from "../../shared/brief.js";
import type { ToolContext } from "./context.js";

export function createUpdateDesignBriefTool(ctx: ToolContext) {
  return defineTool({
    name: "update_design_brief",
    label: "更新需求档案",
    description:
      "把你从用户处确认到的设计需求写入结构化档案。只提交新增或变更的字段；" +
      "未经用户确认的推测不要写入正式字段（放 freeText 并加「待确认：」前缀）。" +
      "每次确认到新信息后立即调用；reason 用一句话说明本次变更缘由。",
    parameters: Type.Object({
      patch: Type.Object({
        projectType: Type.Optional(Type.String({ description: "项目类型：住宅/办公/文化/商业…" })),
        styleKeywords: Type.Optional(Type.Array(Type.String(), { description: "风格基调关键词（整体替换）" })),
        massing: Type.Optional(Type.String({ description: "体量规模：层数/密度/尺度" })),
        materials: Type.Optional(Type.Array(Type.String(), { description: "材质清单（整体替换）" })),
        context: Type.Optional(Type.String({ description: "环境语境" })),
        camera: Type.Optional(Type.String({ description: "镜头视角" })),
        lighting: Type.Optional(Type.String({ description: "光照时段" })),
        mood: Type.Optional(Type.String({ description: "氛围意向" })),
        negative: Type.Optional(Type.Array(Type.String(), { description: "负面约束（整体替换）" })),
        freeText: Type.Optional(Type.String({ description: "自然语言补充" })),
        completeness: Type.Optional(
          Type.Union([Type.Literal("ready"), Type.Literal("needMoreInfo")], {
            description: "信息是否足够出图",
          }),
        ),
      }),
      reason: Type.String({ description: "一句话说明变更缘由" }),
    }),
    execute: async (
      _toolCallId: string,
      params: { patch: DesignBriefPatch; reason: string },
      _signal?: AbortSignal,
      _onUpdate?: unknown,
      _piCtx?: unknown,
    ) => {
      const merged: DesignBrief = ctx.applyBriefPatch(params.patch, params.reason);
      return {
        content: [
          {
            type: "text" as const,
            text: `需求档案已更新（${params.reason}）。当前档案：\n${summarizeBrief(merged)}`,
          },
        ],
        details: { brief: merged },
      };
    },
  });
}
