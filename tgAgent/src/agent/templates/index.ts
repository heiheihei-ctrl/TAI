/**
 * 建筑渲染 Prompt 片段库（v1 第二轮调优版）。
 *
 * 结构：按 类型×视角×光照×风格×材质 五个维度组织片段，
 * promptAssembly.ts 在组装时按 brief 字段查表拼装。
 *
 * v1 调优：
 * - 负向词库扩充实（每风格 ≥4 条对抗项）
 * - 英文别名映射（promptAssembly 双轨输出）
 * - 新增风格：现代、折中主义、禅意、参数化、生态建筑
 * - 视角新增：鸟瞰、室内小类
 */

// ---------------------------------------------------------------------------
// 质量尾缀
// ---------------------------------------------------------------------------

export const QUALITY_TAIL_EN =
  "photorealistic architectural visualization, physically based materials, " +
  "global illumination, high dynamic range, professional architectural photography, " +
  "8k, ultra detailed, sharp focus";

export const QUALITY_TAIL_ZH =
  "照片级建筑渲染， physically based materials，全局光照，高动态范围，专业建筑摄影，超精细";

// ---------------------------------------------------------------------------
// 项目类型
// ---------------------------------------------------------------------------

/** 中文 → 正向 prompt（自动贴英文尾部） */
export const PROJECT_TYPE_FRAGMENTS: Record<string, string> = {
  住宅: "residential building, warm domestic scale, human-friendly proportions",
  办公楼: "commercial office building, contemporary curtain wall facade, professional corporate architecture",
  文化建筑: "cultural building, museum or gallery, expressive form, iconic architecture",
  商业: "commercial building, retail podium, vibrant street activation",
  教育: "educational building, campus architecture, open and inviting",
  医疗: "healthcare facility, clean and calming environment, healing architecture",
  综合体: "mixed-use development, layered program, urban density",
  酒店: "hospitality building, luxury resort or boutique hotel, experiential design",
  展览: "exhibition pavilion, temporary or permanent exhibit space, dramatic spatial experience",
};

/** 类型英文别名（中文输入时的兼容映射） */
const PROJECT_TYPE_ALIASES: Record<string, string> = {
  // 英文
  "apartment": "住宅", "condo": "住宅", "villa": "住宅",
  "office": "办公楼", "commercial": "商业", "retail": "商业",
  "museum": "文化建筑", "gallery": "文化建筑", "cultural": "文化建筑",
  // 中文直接映射（中文 alias → 中文 key，让 resolveProjectType 支持中文别名）
  "博物馆": "文化建筑", "美术馆": "文化建筑", "图书馆": "文化建筑", "剧院": "文化建筑",
  "学校": "教育", "大学": "教育", "教学楼": "教育",
  "医院": "医疗", "诊所": "医疗",
  "酒店": "酒店",
  "会展中心": "展览", "展馆": "展览",
  "小区": "住宅", "公寓": "住宅", "别墅": "住宅", "保障房": "住宅",
  "商场": "商业", "购物中心": "商业",
  "产业园": "综合体",
};

export function resolveProjectType(input: string): string | undefined {
  const trimmed = input.trim();
  if (PROJECT_TYPE_FRAGMENTS[trimmed]) return trimmed;
  const lower = trimmed.toLowerCase();
  if (PROJECT_TYPE_ALIASES[lower]) return PROJECT_TYPE_ALIASES[lower];
  // 模糊：含关键词
  for (const [key, alias] of Object.entries(PROJECT_TYPE_ALIASES)) {
    if (lower.includes(key)) return alias;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 视角
// ---------------------------------------------------------------------------

/** 中文视角 → prompt */
export const CAMERA_FRAGMENTS: Record<string, string> = {
  人视: "eye-level perspective, human scale, frontal view of the facade, street-level photography",
  鸟瞰: "aerial bird's-eye view, top-down perspective, masterplan overview, drone photography, bird's-eye",
  轴测: "isometric axonometric view, architectural diagram style, clean lines, technical drawing aesthetic",
  室内: "interior view, looking into the space, interior architectural photography, furnishings visible",
  入口: "entrance perspective, approaching the building, threshold moment, welcoming entry sequence",
  街角: "corner view, street corner intersection, urban context, contextual photography",
  剖透视: "sectional perspective, cut-away view, interior structure visible, architectural section drawing",
  总图: "masterplan view, site plan overview, urban layout, birds-eye scale",
};

const CAMERA_ALIASES: Record<string, string> = {
  "eye-level": "人视", "frontal": "人视", "street": "人视",
  "aerial": "鸟瞰", "birds-eye": "鸟瞰", "top-down": "鸟瞰", "drone": "鸟瞰",
  "isometric": "轴测", "axonometric": "轴测",
  "interior": "室内", "indoor": "室内",
  "entrance": "入口", "approach": "入口",
  "corner": "街角", "intersection": "街角",
  "section": "剖透视", "cut": "剖透视",
  "masterplan": "总图", "site-plan": "总图",
};

export function resolveCamera(input: string): string | undefined {
  const trimmed = input.trim();
  if (CAMERA_FRAGMENTS[trimmed]) return trimmed;
  const lower = trimmed.toLowerCase();
  if (CAMERA_ALIASES[lower]) return CAMERA_ALIASES[lower];
  for (const [key, alias] of Object.entries(CAMERA_ALIASES)) {
    if (lower.includes(key)) return alias;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 光照 / 时段
// ---------------------------------------------------------------------------

export const LIGHTING_FRAGMENTS: Record<string, string> = {
  黄昏: "golden hour sunset lighting, warm amber tones, long soft shadows, cinematic atmosphere",
  清晨: "early morning light, soft cool tones, gentle shadows, fresh dew atmosphere, misty",
  夜景: "nighttime illumination, artificial lighting, buildings glowing, dark sky, dramatic contrast",
  阴天柔光: "overcast diffused daylight, soft even lighting, no harsh shadows, calm neutral tones",
  正午: "midday sunlight, strong contrast, bright exposure, harsh shadows, clarity",
  暴风雨: "dramatic storm lighting, dark clouds, shafts of light breaking through, Moody atmosphere",
  雪景: "snow-covered winter scene, soft white light, muted tones, cold atmosphere",
};

const LIGHTING_ALIASES: Record<string, string> = {
  "golden": "黄昏", "sunset": "黄昏", "sunrise": "清晨",
  "night": "夜景", "dark": "夜景",
  "overcast": "阴天柔光", "cloudy": "阴天柔光", "soft": "阴天柔光",
  "midday": "正午", "noon": "正午", "sunny": "正午",
  "storm": "暴风雨", "rain": "暴风雨",
  "snow": "雪景", "winter": "雪景",
};

export function resolveLighting(input: string): string | undefined {
  const trimmed = input.trim();
  if (LIGHTING_FRAGMENTS[trimmed]) return trimmed;
  const lower = trimmed.toLowerCase();
  if (LIGHTING_ALIASES[lower]) return LIGHTING_ALIASES[lower];
  for (const [key, alias] of Object.entries(LIGHTING_ALIASES)) {
    if (lower.includes(key)) return alias;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 风格基调（v1 扩充版：6→10 风格，负向词每风格 ≥5 条）
// ---------------------------------------------------------------------------

export interface StyleEntry {
  prompt: string;
  suggestedMaterials: string[];
  negativeHints: string[];
  /** 英文别名（中文覆盖时同 key，英文输入时按别名路由） */
  aliases?: string[];
}

export const STYLE_FRAGMENTS: Record<string, StyleEntry> = {
  现代极简: {
    prompt: "modern minimalist architecture, clean geometric forms, minimal ornamentation, "
      + "monochromatic palette, elegance through restraint, Mies van der Rohe inspired",
    suggestedMaterials: ["玻璃幕墙", "清水混凝土", "不锈钢", "浅色石材"],
    negativeHints: [
      "ornate decoration", "cluttered facade", "excessive ornament",
      "busy patterns", "colorful murals", "decorative moldings",
    ],
  },
  在地温度: {
    prompt: "contextual architecture, local vernacular spirit, warm organic materials, "
      + "sense of place, culturally rooted design, craftsman-like detail",
    suggestedMaterials: ["陶板", "木材", "当地石材", "夯土"],
    negativeHints: [
      "generic international style", "cold materials", "placeless design",
      "glass box uniformity", "corporate blandness", "imported aesthetic",
    ],
  },
  未来感: {
    prompt: "futuristic architecture, parametric design, flowing organic forms, "
      + "technology-forward aesthetic, sci-fi inspired, dynamic silhouette",
    suggestedMaterials: ["玻璃幕墙", "金属面板", "LED 灯带", "复合板材"],
    negativeHints: [
      "traditional details", "heavy masonry", "conventional structure",
      "straight lines only", "classical proportions", "decorative elements",
    ],
  },
  新中式: {
    prompt: "contemporary Chinese architecture, modern interpretation of traditional forms, "
      + "layered spatial experience, poetic atmosphere, cultural resonance",
    suggestedMaterials: ["木格栅", "陶板", "灰砖", "玻璃幕墙"],
    negativeHints: [
      "western classical columns", "plastic materials", "overly modern glass box",
      "ornate western detailing", "bright neon colors", "commercial signage",
    ],
  },
  工业风: {
    prompt: "industrial architecture, exposed structure, raw materials, honest construction, "
      + "warehouse aesthetic, urban loft sensibility",
    suggestedMaterials: ["混凝土", "钢铁", "裸露管道", "木质梁"],
    negativeHints: [
      "polished finishes", "decorative moldings", "soft materials",
      "carpeted floors", "curtain walls", "ornate fixtures",
    ],
  },
  有机建筑: {
    prompt: "organic architecture, flowing natural forms, biomorphic design, Frank Lloyd Wright inspired, "
      + "harmony with landscape, curvilinear geometry",
    suggestedMaterials: ["清水混凝土", "木材", "石材", "玻璃幕墙"],
    negativeHints: [
      "rigid geometry", "artificial looking", "geometric abstraction",
      "boxy forms", "perfect circles", "symmetry obsession",
    ],
  },
  // ── v1 新增 ──
  现代: {
    prompt: "contemporary architecture, sleek modern design, large-span glazing, "
      + "structural clarity, functional elegance, current design language",
    suggestedMaterials: ["玻璃幕墙", "铝合金", "钢材", "预制混凝土"],
    negativeHints: [
      "outdated style", "vintage elements", "ornate decoration",
      "traditional roof", "small windows", "heavy masonry",
    ],
  },
  折中主义: {
    prompt: "eclectic architecture, mixed historical references, playful juxtaposition, "
      + "rich material palette, layered details, visually engaging composition",
    suggestedMaterials: ["红砖", "金属", "木材", "石材"],
    negativeHints: [
      "single style purity", "minimalist restraint", "monochromatic",
      "uniform treatment", "lack of detail", "boring composition",
    ],
  },
  禅意: {
    prompt: "zen architecture, contemplative atmosphere, wabi-sabi aesthetic, "
      + "natural materials, shadow and light poetry, negative space as design element",
    suggestedMaterials: ["木材", "和纸", "竹子", "石材"],
    negativeHints: [
      "bright colors", "artificial lighting", "neon",
      "busy patterns", "reflective surfaces", "commercial signage",
    ],
  },
  参数化: {
    prompt: "parametric architecture, algorithmically generated form, "
      + "complex surface geometry, computational design, futuristic facade pattern",
    suggestedMaterials: ["金属面板", "GRC", "玻璃幕墙", "复合材料"],
    negativeHints: [
      "simple geometry", "flat surfaces", "regular grid",
      "handcrafted look", "traditional construction", "orthogonal layout",
    ],
  },
  生态建筑: {
    prompt: "sustainable green architecture, biophilic design, living facade, "
      + "integrated photovoltaic systems, rainwater harvesting visible, LEED certified aesthetic",
    suggestedMaterials: ["木材", "绿植墙面", "太阳能板", "回收钢材"],
    negativeHints: [
      "high energy consumption look", "dead facades", "no greenery",
      "excessive glass", "heat island effect", "concrete only",
    ],
  },
};

/** 风格英文别名路由 */
const STYLE_ALIASES: Record<string, string> = {
  "minimalist": "现代极简", "minimal": "现代极简",
  "vernacular": "在地温度", "local": "在地温度", "contextual": "在地温度",
  "futuristic": "未来感",
  "contemporary chinese": "新中式",
  "industrial": "工业风", "loft": "工业风",
  "organic": "有机建筑", "biomorphic": "有机建筑",
  "contemporary": "现代", "modern": "现代",
  "eclectic": "折中主义", "mixed": "折中主义",
  "zen": "禅意", "wabi-sabi": "禅意", "japanese": "禅意",
  "parametric": "参数化", "computational": "参数化",
  "sustainable": "生态建筑", "green": "生态建筑", "biophilic": "生态建筑", "eco": "生态建筑",
  "high-tech": "未来感",
};

export function resolveStyle(input: string): string | undefined {
  const trimmed = input.trim();
  if (STYLE_FRAGMENTS[trimmed]) return trimmed;
  const lower = trimmed.toLowerCase();
  if (STYLE_ALIASES[lower]) return STYLE_ALIASES[lower];
  for (const [key, alias] of Object.entries(STYLE_ALIASES)) {
    if (lower.includes(key)) return alias;
  }
  // 中文模糊匹配
  for (const key of Object.keys(STYLE_FRAGMENTS)) {
    if (trimmed.includes(key) || key.includes(trimmed)) return key;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 氛围
// ---------------------------------------------------------------------------

export const MOOD_FRAGMENTS: Record<string, string> = {
  宁静: "serene atmosphere, peaceful feeling, calming palette, meditative quality",
  活力: "energetic atmosphere, vibrant, dynamic, urban buzz, movement implied",
  诗意: "poetic atmosphere, dreamlike quality, ethereal light, romantic",
  力量感: "monumental presence, imposing scale, awe-inspiring, grounded gravitas",
  轻盈: "light and airy feeling, floating quality, transparent, weightless aesthetic",
  神秘: "mysterious atmosphere, unclear boundaries, shadow-led composition, enigmatic quality",
};

const MOOD_ALIASES: Record<string, string> = {
  "serene": "宁静", "peaceful": "宁静", "calm": "宁静",
  "energetic": "活力", "vibrant": "活力", "dynamic": "活力",
  "poetic": "诗意", "dreamy": "诗意", "ethereal": "诗意",
  "monumental": "力量感", "imposing": "力量感", "powerful": "力量感",
  "light": "轻盈", "airy": "轻盈", "floating": "轻盈",
  "mysterious": "神秘", "enigmatic": "神秘",
};

export function resolveMood(input: string): string | undefined {
  const trimmed = input.trim();
  if (MOOD_FRAGMENTS[trimmed]) return trimmed;
  const lower = trimmed.toLowerCase();
  if (MOOD_ALIASES[lower]) return MOOD_ALIASES[lower];
  for (const [key, alias] of Object.entries(MOOD_ALIASES)) {
    if (lower.includes(key)) return alias;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 环境语境
// ---------------------------------------------------------------------------

export const CONTEXT_FRAGMENTS: Record<string, string> = {
  滨海: "coastal location, oceanfront, seaside cliffs, maritime climate, salt air",
  山地: "mountainous terrain, hillside site, elevated position, natural topography",
  城市街区: "urban context, city street, dense neighborhood, existing urban fabric",
  滨水: "waterfront site, riverside or lakeside, water reflection, riparian",
  郊区: "suburban setting, green surroundings, low density, residential scale",
  荒漠: "arid landscape, desert context, extreme climate, geological forms",
  森林: "forested site, tree canopy, natural woodland, green enclosure",
  历史街区: "historic district, preserved heritage buildings, old city fabric, cultural layering",
  海岛: "island setting, surrounded by sea, tropical maritime climate, isolated location",
};

const CONTEXT_ALIASES: Record<string, string> = {
  "coastal": "滨海", "ocean": "滨海", "seaside": "滨海",
  "mountain": "山地", "hillside": "山地",
  "urban": "城市街区", "city": "城市街区", "downtown": "城市街区",
  "waterfront": "滨水", "riverside": "滨水", "lakeside": "滨水",
  "suburban": "郊区", "countryside": "郊区",
  "desert": "荒漠", "arid": "荒漠",
  "forest": "森林", "woodland": "森林",
  "historic": "历史街区", "heritage": "历史街区", "old town": "历史街区",
  "island": "海岛", "tropical": "海岛",
};

export function resolveContext(input: string): string | undefined {
  const trimmed = input.trim();
  if (CONTEXT_FRAGMENTS[trimmed]) return trimmed;
  const lower = trimmed.toLowerCase();
  if (CONTEXT_ALIASES[lower]) return CONTEXT_ALIASES[lower];
  for (const [key, alias] of Object.entries(CONTEXT_ALIASES)) {
    if (lower.includes(key)) return alias;
  }
  return undefined;
}
