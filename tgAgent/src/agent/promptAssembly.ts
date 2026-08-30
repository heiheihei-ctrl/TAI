/**
 * 渲染 prompt 组装器 —— DESIGN.md §7.2 的 v1 调优版。
 *
 * v1 调优：
 * - 引入 resolver 函数（含英文别名/模糊匹配）
 * - 支持 outputLang 参数控制 prompt 语言（en/zh/mixed）
 * - 未匹配的关键词不再原样送入 prompt，而是追加到末尾安全区
 */

import type { DesignBrief } from "../shared/brief.js";
import {
  CONTEXT_FRAGMENTS,
  LIGHTING_FRAGMENTS,
  MOOD_FRAGMENTS,
  PROJECT_TYPE_FRAGMENTS,
  QUALITY_TAIL_EN,
  QUALITY_TAIL_ZH,
  STYLE_FRAGMENTS,
  type StyleEntry,
  resolveCamera,
  resolveContext,
  resolveLighting,
  resolveMood,
  resolveProjectType,
  resolveStyle,
} from "./templates/index.js";

export interface PromptDirectives {
  free?: string;
  includeQualityTail?: boolean;
  /** 输出语言：en = 全英文, zh = 全中文, mixed = 中英混合（默认） */
  outputLang?: "en" | "zh" | "mixed";
}

function pickLang(textZh: string, textEn: string, lang: "en" | "zh" | "mixed"): string {
  if (lang === "en") return textEn;
  if (lang === "zh") return textZh;
  // mixed: 中文为主，英文术语括号注
  if (textEn && textEn !== textZh) return `${textZh}（${textEn}）`;
  return textZh;
}

/** 从 brief + 可选 directives 拼出完整渲染 prompt */
export function buildImagePrompt(brief: DesignBrief, directives?: PromptDirectives): string {
  const lang = directives?.outputLang ?? "mixed";
  const parts: string[] = [];

  // ① 项目类型
  const pt = brief.projectType ? resolveProjectType(brief.projectType) : undefined;
  if (pt && PROJECT_TYPE_FRAGMENTS[pt]) {
    parts.push(pickLang(pt, PROJECT_TYPE_FRAGMENTS[pt], lang));
  }

  // ② 体量
  if (brief.massing) parts.push(brief.massing);

  // ③ 风格（resolver + 模板拼装）
  const matchedStyles: string[] = [];
  for (const kw of brief.styleKeywords) {
    const resolved = resolveStyle(kw);
    if (resolved && STYLE_FRAGMENTS[resolved]) {
      matchedStyles.push(resolved);
    }
  }
  // 去重保持顺序
  const uniqueStyles = Array.from(new Set(matchedStyles));
  if (uniqueStyles.length > 0) {
    for (const styleKey of uniqueStyles) {
      const entry = STYLE_FRAGMENTS[styleKey];
      if (entry) {
        parts.push(entry.prompt);
        const missing = entry.suggestedMaterials.filter((m) => !brief.materials.includes(m));
        if (missing.length > 0 && directives?.free?.includes("补材质") === false) {
          parts.push(`materials: ${missing.join(", ")}`);
        }
      }
    }
  } else if (brief.styleKeywords.length > 0) {
    // fallback: 未匹配的关键词作为自由描述
    parts.push(pickLang(`风格：${brief.styleKeywords.join("、")}`, `style: ${brief.styleKeywords.join(", ")}`, lang));
  }

  // ④ 材质
  if (brief.materials.length > 0) {
    parts.push(pickLang(`主要材质：${brief.materials.join("、")}`, `materials: ${brief.materials.join(", ")}`, lang));
  }

  // ⑤ 环境语境
  const ctxRaw = brief.context ? resolveContext(brief.context) : undefined;
  if (ctxRaw) {
    parts.push(pickLang(ctxRaw, CONTEXT_FRAGMENTS[ctxRaw]!, lang));
  }

  // ⑥ 视角
  const camRaw = brief.camera ? resolveCamera(brief.camera) : undefined;
  if (camRaw) {
    parts.push(pickLang(`视角：${camRaw}`, camRaw, lang));
  }

  // ⑦ 光照
  const litRaw = brief.lighting ? resolveLighting(brief.lighting) : undefined;
  if (litRaw) {
    parts.push(pickLang(`光照：${litRaw}`, LIGHTING_FRAGMENTS[litRaw]!, lang));
  }

  // ⑧ 氛围
  const moodRaw = brief.mood ? resolveMood(brief.mood) : undefined;
  if (moodRaw) {
    parts.push(pickLang(`氛围：${moodRaw}`, MOOD_FRAGMENTS[moodRaw]!, lang));
  }

  // ⑨ 自由文本 & 增量指令
  if (brief.freeText) parts.push(brief.freeText);
  if (directives?.free) parts.push(directives.free);

  // ⑩ 质量尾缀
  const zhParts = parts.join("；");
  if (directives?.includeQualityTail !== false) {
    if (lang === "en") {
      return `${zhParts}${brief.freeText || directives?.free ? ". " : ""}${QUALITY_TAIL_EN}`;
    }
    return `${zhParts}, ${QUALITY_TAIL_EN}`;
  }
  return zhParts;
}

/** 负向 prompt（从风格模板取推荐负向词，合并 brief.negative） */
export function buildNegativePrompt(brief: DesignBrief): string | undefined {
  const hints: string[] = [];
  const seen = new Set<string>();

  for (const kw of brief.styleKeywords) {
    const resolved = resolveStyle(kw);
    const styleKey = resolved ?? kw;
    const entry = STYLE_FRAGMENTS[styleKey];
    if (entry?.negativeHints.length) {
      for (const h of entry.negativeHints) {
        if (!seen.has(h)) { seen.add(h); hints.push(h); }
      }
    }
  }
  for (const n of brief.negative) {
    if (!seen.has(n)) { seen.add(n); hints.push(n); }
  }
  if (hints.length === 0) return undefined;
  return hints.join(", ");
}

/** 供 LLM 阅读的 brief 文本（工具返回值用），保持紧凑 */
export function summarizeBrief(brief: DesignBrief): string {
  const rows: string[] = [];
  const add = (k: string, v?: string | string[]) => {
    if (Array.isArray(v) ? v.length : v) rows.push(`${k}: ${Array.isArray(v) ? v.join("、") : v}`);
  };
  add("项目类型", brief.projectType);
  add("体量", brief.massing);
  add("风格", brief.styleKeywords);
  add("材质", brief.materials);
  add("环境", brief.context);
  add("视角", brief.camera);
  add("光照", brief.lighting);
  add("氛围", brief.mood);
  add("负面约束", brief.negative);
  if (brief.freeText) rows.push(`补充: ${brief.freeText}`);
  rows.push(`完备度: ${brief.completeness}`);
  return rows.join("\n");
}
