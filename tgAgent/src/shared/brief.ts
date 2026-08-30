/**
 * 设计需求档案（Design Brief）—— 对应 DESIGN.md §3.2
 * agent 通过 update_design_brief 工具增量维护；前端渲染为属性面板，允许设计师手改。
 */

export interface DesignBrief {
  /** 项目类型：住宅/办公/文化/商业/教育/医疗/综合体… */
  projectType?: string;
  /** 风格基调关键词：现代极简/在地温度/未来感/新中式… */
  styleKeywords: string[];
  /** 体量与规模描述：层数、密度、尺度感 */
  massing?: string;
  /** 材质偏好：玻璃幕墙/陶板/清水混凝土/木材… */
  materials: string[];
  /** 环境语境：滨海/山地/城市街区肌理… */
  context?: string;
  /** 镜头视角：人视/鸟瞰/轴测/室内… */
  camera?: string;
  /** 光照时段：黄昏/清晨/夜景/阴天柔光… */
  lighting?: string;
  /** 氛围意向 */
  mood?: string;
  /** 负面约束：明确排除项 */
  negative: string[];
  /** 自然语言补充（含「待确认：」前缀的未确认项） */
  freeText: string;
  /**
   * agent 自评的完备度。needMoreInfo 时 agent 应先追问最关键的缺口
   * （每轮最多2个、给选择题），三项核心（类型+视角+风格）齐备即可出图。
   */
  completeness: "ready" | "needMoreInfo";
  /** 最近一次变更的说明（审计用） */
  lastReason?: string;
  updatedAt: string;
}

export function emptyBrief(): DesignBrief {
  return {
    styleKeywords: [],
    materials: [],
    negative: [],
    freeText: "",
    completeness: "needMoreInfo",
    updatedAt: new Date().toISOString(),
  };
}

export type DesignBriefPatch = Partial<Omit<DesignBrief, "updatedAt" | "lastReason">>;

/**
 * 深合并语义（对应 DESIGN.md §4.1）：
 * - 数组字段整体替换（模型 patch 里给的是本次确认的完整清单）
 * - 标量字段仅在提供新值时覆盖
 * - completeness 只允许单向 needMoreInfo → ready（重开需显式置回）
 */
export function mergeBrief(current: DesignBrief, patch: DesignBriefPatch): DesignBrief {
  const next: DesignBrief = { ...current };
  if (patch.projectType !== undefined) next.projectType = patch.projectType;
  if (patch.styleKeywords !== undefined) next.styleKeywords = [...patch.styleKeywords];
  if (patch.massing !== undefined) next.massing = patch.massing;
  if (patch.materials !== undefined) next.materials = [...patch.materials];
  if (patch.context !== undefined) next.context = patch.context;
  if (patch.camera !== undefined) next.camera = patch.camera;
  if (patch.lighting !== undefined) next.lighting = patch.lighting;
  if (patch.mood !== undefined) next.mood = patch.mood;
  if (patch.negative !== undefined) next.negative = [...patch.negative];
  if (patch.freeText !== undefined) next.freeText = patch.freeText;
  if (patch.completeness !== undefined) next.completeness = patch.completeness;
  next.updatedAt = new Date().toISOString();
  return next;
}
