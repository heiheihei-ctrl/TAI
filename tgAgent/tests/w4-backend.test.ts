/**
 * W4 后端测试：motionPreset 描述映射 + template resolver 函数
 * 运行：npx tsx tests/w4-backend.test.ts
 */

import {
  MOTION_PRESET_DESCRIPTIONS,
} from "../src/agent/tools/generateVideo.js";
import {
  STYLE_FRAGMENTS,
  CAMERA_FRAGMENTS,
  LIGHTING_FRAGMENTS,
  MOOD_FRAGMENTS,
  CONTEXT_FRAGMENTS,
  PROJECT_TYPE_FRAGMENTS,
  resolveStyle,
  resolveCamera,
  resolveLighting,
  resolveMood,
  resolveContext,
  resolveProjectType,
} from "../src/agent/templates/index.js";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; }
  else { fail++; console.error(`  ❌ ${msg}`); }
}

// ── 1. motionPreset 描述映射 ──
console.log("\n[1] Motion preset descriptions");
const expectedPresets = [
  "orbit-left", "orbit-right", "orbit-top",
  "push-in", "pull-out", "dolly-zoom",
  "crane-up", "fly-through", "pan-left", "pan-right", "static-timelapse",
];
assert(Object.keys(MOTION_PRESET_DESCRIPTIONS).length === expectedPresets.length,
  `10 种运镜模式（当前: ${Object.keys(MOTION_PRESET_DESCRIPTIONS).length}）`);
for (const key of expectedPresets) {
  const desc = MOTION_PRESET_DESCRIPTIONS[key];
  assert(!!desc && desc.length > 10, `${key}: 描述非空`);
}

// ── 2. Resolver 函数 ──
console.log("\n[2] Template resolvers");

// Style
assert(resolveStyle("现代极简") === "现代极简", "中文风格→现代极简");
assert(resolveStyle("modern minimalist") === "现代极简", "英文风格→现代极简");
assert(resolveStyle("sustainable green") === "生态建筑", "英文风格→生态建筑");
assert(resolveStyle("zen") === "禅意", "英文风格→禅意");
assert(resolveStyle("parametric") === "参数化", "英文风格→参数化");
assert(resolveStyle(" utterlyrandom ") === undefined, "未知风格→undefined");

// Camera
assert(resolveCamera("人视") === "人视", "中文视角→人视");
assert(resolveCamera("eye-level") === "人视", "英文视角→人视");
assert(resolveCamera("aerial") === "鸟瞰", "英文视角→鸟瞰");

// Lighting
assert(resolveLighting("黄昏") === "黄昏", "中文光照→黄昏");
assert(resolveLighting("golden hour") === "黄昏", "英文光照→黄昏");
assert(resolveLighting("暴风雨") === "暴风雨", "中文光照→暴风雨");

// Mood
assert(resolveMood("宁静") === "宁静", "中文氛围→宁静");
assert(resolveMood("serene") === "宁静", "英文氛围→宁静");
assert(resolveMood("mysterious") === "神秘", "英文氛围→神秘");

// Context
assert(resolveContext("滨海") === "滨海", "中文环境→滨海");
assert(resolveContext("coastal") === "滨海", "英文环境→滨海");
assert(resolveContext("历史街区") === "历史街区", "中文环境→历史街区");

// Project type
assert(resolveProjectType("办公楼") === "办公楼", "中文类型→办公楼");
assert(resolveProjectType("office building") === "办公楼", "英文类型→办公楼");
assert(resolveProjectType("博物馆") === "文化建筑", "中文类型→文化建筑");

// ── 3. Style template quality ──
console.log("\n[3] Style template quality");
for (const [name, entry] of Object.entries(STYLE_FRAGMENTS)) {
  assert(entry.negativeHints.length >= 5, `${name}: 负向词≥5 (${entry.negativeHints.length})`);
  assert(entry.prompt.length > 20, `${name}: prompt 非空`);
  // no duplicate negative hints
  const unique = new Set(entry.negativeHints);
  assert(unique.size === entry.negativeHints.length, `${name}: 负向词无重复`);
}

// ── 4. Camera fragments ──
console.log("\n[4] Camera fragments");
assert(Object.keys(CAMERA_FRAGMENTS).length >= 6, `视角≥6种 (${Object.keys(CAMERA_FRAGMENTS).length})`);

// ── 5. Lighting fragments ──
console.log("\n[5] Lighting fragments");
assert(Object.keys(LIGHTING_FRAGMENTS).length >= 5, `光照≥5种 (${Object.keys(LIGHTING_FRAGMENTS).length})`);

// ── 6. Context fragments ──
console.log("\n[6] Context fragments");
assert(Object.keys(CONTEXT_FRAGMENTS).length >= 7, `环境≥7种 (${Object.keys(CONTEXT_FRAGMENTS).length})`);

// ── 7. Project type fragments ──
console.log("\n[7] Project type fragments");
assert(Object.keys(PROJECT_TYPE_FRAGMENTS).length >= 8, `项目类型≥8种 (${Object.keys(PROJECT_TYPE_FRAGMENTS).length})`);

console.log(`\n━━━ 结果: ${pass} pass / ${fail} fail ━━━`);
if (fail > 0) process.exit(1);
