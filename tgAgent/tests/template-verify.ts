/**
 * 模板库 + promptAssembly 验证脚本（W4 验证）
 * 验证：resolver 函数、prompt 组装、负向词聚合
 */

import {
  STYLE_FRAGMENTS, CAMERA_FRAGMENTS, LIGHTING_FRAGMENTS,
  MOOD_FRAGMENTS, CONTEXT_FRAGMENTS, PROJECT_TYPE_FRAGMENTS,
  resolveStyle, resolveCamera, resolveLighting, resolveMood,
  resolveContext, resolveProjectType,
} from "../src/agent/templates/index.js";
import { emptyBrief } from "../src/shared/brief.js";
import { buildImagePrompt, buildNegativePrompt } from "../src/agent/promptAssembly.js";

let pass = 0;
let fail = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`  ✅ ${msg}`); }
  else { fail++; console.error(`  ❌ ${msg}`); }
}

// ── 1. 风格词库规模 ──
console.log("\n[1] 风格词库规模");
assert(Object.keys(STYLE_FRAGMENTS).length >= 10, `≥10 种风格（当前: ${Object.keys(STYLE_FRAGMENTS).length}）`);
for (const [name, entry] of Object.entries(STYLE_FRAGMENTS)) {
  assert(entry.negativeHints.length >= 5, `${name}: 负向词 ≥5（当前: ${entry.negativeHints.length}）`);
  assert(entry.prompt.length > 20, `${name}: prompt 非空`);
}

// ── 2. Resolver 函数 ──
console.log("\n[2] Resolver 函数");
assert(resolveStyle("modern minimalist") === "现代极简", "英文风格 → 现代极简");
assert(resolveStyle("sustainable green") === "生态建筑", "英文风格 → 生态建筑");
assert(resolveStyle("禅意") === "禅意", "中文风格 → 禅意");
assert(resolveCamera("eye-level") === "人视", "英文视角 → 人视");
assert(resolveCamera("鸟瞰") === "鸟瞰", "中文视角 → 鸟瞰");
assert(resolveLighting("golden hour") === "黄昏", "英文光照 → 黄昏");
assert(resolveLighting("暴风雨") === "暴风雨", "中文光照 → 暴风雨（新增）");
assert(resolveMood("serene") === "宁静", "英文氛围 → 宁静");
assert(resolveContext("coastal") === "滨海", "英文环境 → 滨海");
assert(resolveContext("历史街区") === "历史街区", "中文环境 → 历史街区（新增）");
assert(resolveProjectType("office building") === "办公楼", "英文类型 → 办公楼");
assert(resolveProjectType("博物馆") === "文化建筑", "中文类型 → 文化建筑");

// ── 3. Prompt 组装 ──
console.log("\n[3] Prompt 组装");
const brief = {
  ...emptyBrief(),
  projectType: "办公楼",
  styleKeywords: ["现代极简", "在地温度"],
  camera: "人视",
  lighting: "黄昏",
  mood: "宁静",
  context: "滨海",
  materials: ["玻璃幕墙", "陶板"],
  completeness: "ready" as const,
};
const prompt = buildImagePrompt(brief);
assert(prompt.includes("photorealistic"), "包含质量尾缀");
assert(prompt.includes("办公楼"), "包含项目类型");
assert(prompt.includes("Mies van der Rohe"), "包含风格片段（现代极简）");
assert(prompt.includes("玻璃幕墙"), "包含材质");

const neg = buildNegativePrompt(brief);
if (!neg) { fail++; console.error("  ❌ 负向词为空"); }
else {
  assert(neg.includes("ornate decoration"), "负向词含现代极简对抗项");
  assert(neg.split(",").length >= 5, `负向词 ≥5 条（当前: ${neg.split(",").length}）`);
}

// ── 4. 英文别名未匹配 fallback ──
console.log("\n[4] 未匹配 fallback");
const unknownBrief = { ...emptyBrief(), styleKeywords: ["未知风格XYZ"], completeness: "ready" as const };
const unknownPrompt = buildImagePrompt(unknownBrief);
assert(unknownPrompt.includes("未知风格XYZ"), "未知风格关键词作为自由描述安全落入 prompt");

// ── 5. 新增风格确认 ──
console.log("\n[5] 新增风格");
assert(!!STYLE_FRAGMENTS["现代"], "现代 风格存在");
assert(!!STYLE_FRAGMENTS["折中主义"], "折中主义 风格存在");
assert(!!STYLE_FRAGMENTS["禅意"], "禅意 风格存在");
assert(!!STYLE_FRAGMENTS["参数化"], "参数化 风格存在");
assert(!!STYLE_FRAGMENTS["生态建筑"], "生态建筑 风格存在");

console.log(`\n━━━ 结果: ${pass} pass / ${fail} fail ━━━`);
if (fail > 0) process.exit(1);
