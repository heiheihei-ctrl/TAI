export type WorkflowAgentMode = 'text2img' | 'img2img' | 'chat_only';

export type WorkflowGraphNode = {
  tempId: string;
  type: 'textPrompt' | 'generate' | 'image';
  data?: Record<string, unknown>;
  /** 相对视口中心的偏移（前端再换算为世界坐标） */
  offset: { x: number; y: number };
};

export type WorkflowGraphEdge = {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
};

export type WorkflowApplyGraphCommand = {
  type: 'apply_graph';
  mode: WorkflowAgentMode;
  prompt?: string;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  runNodeIds: string[];
  aspectRatio?: string;
  viewportCenter?: { x: number; y: number };
};

export type WorkflowPlanResult = {
  message: string;
  command: WorkflowApplyGraphCommand | null;
};
