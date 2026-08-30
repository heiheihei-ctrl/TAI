/**
 * 资产与生成任务类型 —— 对应 DESIGN.md §9 数据模型（内存版子集）
 */

export type AssetKind = "image" | "video" | "mask" | "presentation";

/** 生成操作类型，用于画布血缘连线与方案历史呈现 */
export type AssetOperation =
  | "newVariant" // 全新生成（文生图）
  | "img2img" // 参考图生成
  | "inpaint" // 局部重绘
  | "upscale" // 高清放大（v2）
  | "outpaint" // 图片扩展（v2）
  | "video" // 图转视频
  | "presentation"; // 汇报 PPT 生成

export interface Asset {
  id: string;
  projectId: string;
  kind: AssetKind;
  /** 展示用 URL（mock 阶段为本地静态路径，接 TAI 后为 TOS 地址） */
  url: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
  /** 血缘：父资产（迭代来源/首帧来源） */
  parentIds: string[];
  operation: AssetOperation;
  /** 生成时的关键参数快照（复盘与复现用） */
  meta: Record<string, unknown>;
  createdByJobId?: string;
  /** 多候选择优状态：设计师在候选横排中选定/弃用（canvas.update 同步前端） */
  pick?: "candidate" | "final" | "weak";
  /** 软删除标记：前端删除卡片后置位；resync/canvas.place 跳过 */
  deleted: boolean;
  createdAt: string;
}

export type GenJobKind = "image" | "video" | "presentation";

export type GenJobStatus = "queued" | "processing" | "done" | "failed" | "cancelled";

export interface GenJob {
  id: string;
  projectId: string;
  kind: GenJobKind;
  /** 平台侧任务ID（TAI 真实源时为平台任务号） */
  remoteTaskId?: string;
  /** 任务输入参数快照 */
  params: Record<string, unknown>;
  status: GenJobStatus;
  /** 0~100 */
  progress: number;
  stage?: string;
  resultAssetIds: string[];
  error?: string;
  createdAt: string;
  finishedAt?: string;
}
