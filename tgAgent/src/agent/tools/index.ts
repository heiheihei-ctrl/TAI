import type { ToolContext } from "./context.js";
import { createUpdateDesignBriefTool } from "./updateDesignBrief.js";
import { createGenerateRenderingTool } from "./generateRendering.js";
import { createGenerateVideoTool } from "./generateVideo.js";
import { createAnalyzeReferenceTool } from "./analyzeReference.js";
import { createPresentationTool } from "./presentation.js";

/** 每个会话构造一套绑定上下文的工具实例 */
export function createTools(ctx: ToolContext) {
  return [
    createUpdateDesignBriefTool(ctx),
    createGenerateRenderingTool(ctx),
    createGenerateVideoTool(ctx),
    createAnalyzeReferenceTool(ctx),
    createPresentationTool(ctx),
  ];
}

export type { ToolContext } from "./context.js";
