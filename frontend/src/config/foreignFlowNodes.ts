import { SHOW_FOREIGN_NODES } from "@/config/featureFlags";

/**
 * 国外模型公司节点（按能力归属，非接入通道）。
 * 关闭 `VITE_SHOW_FOREIGN_NODES` 时从面板 / 快捷连接隐藏。
 */
export const FOREIGN_FLOW_NODE_TYPES = new Set<string>([
  // 生图 / Google · Midjourney · OpenAI
  "generate",
  "generate4",
  "generatePro",
  "generatePro4",
  "generateRef",
  "viewAngle",
  "midjourney",
  "midjourneyV7",
  "niji7",
  "nano2",
  "gptImage2",
  "analysis",
  // 视频 / OpenAI · Omni
  "sora2Video",
  "sora2Character",
  "omniFlashExtVideo",
  // 分析 / 对话 / 提示词（Gemini）
  "videoAnalyze",
  "promptOptimize",
  "textChat",
]);

export const isForeignFlowNodeType = (nodeType?: string | null): boolean => {
  if (!nodeType) return false;
  return FOREIGN_FLOW_NODE_TYPES.has(nodeType);
};

/** 当前环境是否应隐藏该国外节点（已有画布节点不删，仅禁止新建入口） */
export const shouldHideForeignFlowNode = (nodeType?: string | null): boolean =>
  !SHOW_FOREIGN_NODES && isForeignFlowNodeType(nodeType);
