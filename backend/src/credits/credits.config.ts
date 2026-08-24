import {
  getSeedream5ProResolutionPricing,
  getSeedream5ResolutionPricing,
} from './brand-credit-pricing';

const TAI_SEEDREAM5_PRO_RESOLUTION_PRICING = getSeedream5ProResolutionPricing('tai');
const TAI_SEEDREAM5_RESOLUTION_PRICING = getSeedream5ResolutionPricing('tai');

// 积分定价配置
export const CREDIT_PRICING_CONFIG = {
  // Gemini 图像服务
  'gemini-3-pro-image': {
    serviceName: 'Nano banana Pro 生图',
    provider: 'gemini',
    creditsPerCall: 40,
    description: '使用 Nano banana Pro 模型生成高质量图像',
    // 按分辨率定价：Pro模式支持1K/2K/4K（普通通道，非腾讯通道）
    resolutionPricing: {
      '1K': 40,
      '2K': 60,
      '4K': 80,
    },
  },
  'gemini-3.1-image': {
    serviceName: 'Nano banana 2 生图',
    provider: 'gemini',
    creditsPerCall: 30,
    description: '使用 Nano banana 2 模型生成高质量图像',
    // 按分辨率定价：Ultra模式支持0.5K/1K/2K/4K（普通通道，非腾讯通道）
    resolutionPricing: {
      '0.5K': 30,
      '1K': 30,
      '2K': 40,
      '4K': 50,
    },
  },
  'gemini-2.5-image': {
    serviceName: 'Nano banana 生图',
    provider: 'gemini',
    creditsPerCall: 20,
    description: '使用 Nano banana 模型生成图像',
    // 按分辨率定价：Fast模式仅支持1K（普通通道，非腾讯通道）
    resolutionPricing: {
      '1K': 20,
    },
  },
  'gemini-image-edit': {
    serviceName: 'Nano banana Pro 图像编辑（Pro）',
    provider: 'gemini',
    creditsPerCall: 40,
    description: '使用 Nano banana Pro 编辑图像',
    resolutionPricing: {
      '1K': 40,
      '2K': 60,
      '4K': 80,
    },
  },
  'gemini-3.1-image-edit': {
    serviceName: 'Nano banana 2 图像编辑（Ultra）',
    provider: 'gemini',
    creditsPerCall: 30,
    description: '使用 Nano banana 2 编辑图像',
    resolutionPricing: {
      '0.5K': 30,
      '1K': 30,
      '2K': 40,
      '4K': 50,
    },
  },
  'gemini-2.5-image-edit': {
    serviceName: 'Nano banana-2.5 图像编辑',
    provider: 'gemini',
    creditsPerCall: 20,
    description: '使用 Nano banana-2.5 编辑图像',
  },
  'gemini-image-blend': {
    serviceName: 'Nano banana Pro 融合（Pro）',
    provider: 'gemini',
    creditsPerCall: 40,
    description: '使用 Nano banana Pro 融合多张图像',
    resolutionPricing: {
      '1K': 40,
      '2K': 60,
      '4K': 80,
    },
  },
  'gemini-3.1-image-blend': {
    serviceName: 'Nano banana 2 融合（Ultra）',
    provider: 'gemini',
    creditsPerCall: 30,
    description: '使用 Nano banana 2 融合多张图像',
    resolutionPricing: {
      '0.5K': 30,
      '1K': 30,
      '2K': 40,
      '4K': 50,
    },
  },
  'gemini-2.5-image-blend': {
    serviceName: 'Nano banana-2.5 融合',
    provider: 'gemini',
    creditsPerCall: 20,
    description: '使用 Nano banana-2.5 融合',
  },
  'gemini-image-analyze': {
    serviceName: 'Gemini 图像分析',
    provider: 'gemini',
    creditsPerCall: 10,
    description: '使用 Nano banana Pro 模型分析图像内容',
  },
  'gemini-3.1-image-analyze': {
    serviceName: 'Nano banana 2 图像分析',
    provider: 'gemini',
    creditsPerCall: 10,
    description: '使用 Nano banana 2 模型分析图像内容',
  },
  'gemini-2.5-image-analyze': {
    serviceName: 'Nano banana 图像分析',
    provider: 'gemini',
    creditsPerCall: 10,
    description: '使用 Nano banana 模型分析图像内容',
  },

  // Gemini 文字服务
  'gemini-text': {
    serviceName: 'Gemini 文字对话',
    provider: 'gemini',
    creditsPerCall: 5,
    description: '使用 Gemini 进行文字对话',
    maxInputTokens: 8000,
    maxContextLength: 32000,
  },
  'gemini-prompt-optimize': {
    serviceName: 'Gemini 提示词优化',
    provider: 'gemini',
    creditsPerCall: 5,
    description: '使用 Gemini 进行提示词优化',
    maxInputTokens: 8000,
    maxContextLength: 32000,
  },
  'gemini-tool-selection': {
    serviceName: 'Gemini 工具选择',
    provider: 'gemini',
    creditsPerCall: 2,
    description: '使用 Gemini 进行智能工具选择',
  },
  'gemini-paperjs': {
    serviceName: 'Gemini Paper.js 生成',
    provider: 'gemini',
    creditsPerCall: 10,
    description: '使用 Gemini 生成 Paper.js 矢量代码',
  },
  'gemini-img2vector': {
    serviceName: 'Gemini 图像转矢量',
    provider: 'gemini',
    creditsPerCall: 16,
    description: '使用 Gemini 将图像转换为 Paper.js 矢量代码',
  },
  'gemini-video-analyze': {
    serviceName: 'Gemini-3.0-flash 视频分析',
    provider: 'gemini',
    creditsPerCall: 60,
    description: '使用 Gemini-3.0-flash 分析视频内容',
  },

  // Sora 视频服务
  'sora-sd': {
    serviceName: 'Sora2 视频生成',
    provider: 'sora',
    creditsPerCall: 200,
    description: '使用 Sora2 生成视频（按模型计费）',
    modelPricing: {
      'sora-2': { creditsPerCall: 200, description: 'Sora2 标准模型' },
      'sora-2-vip': { creditsPerCall: 200, description: 'Sora2 VIP 模型' },
      'sora-2-pro': { creditsPerCall: 750, description: 'Sora2 Pro 专业模型' },
    },
  },
  'sora-hd': {
    serviceName: 'Sora2 高清视频',
    provider: 'sora',
    creditsPerCall: 200,
    description: '使用 Sora2 生成高清视频（按模型计费）',
    modelPricing: {
      'sora-2': { creditsPerCall: 200, description: 'Sora2 标准模型' },
      'sora-2-vip': { creditsPerCall: 200, description: 'Sora2 VIP 模型' },
      'sora-2-pro': { creditsPerCall: 750, description: 'Sora2 Pro 专业模型' },
    },
  },

  // Wan2.6 视频服务
  'wan26-video': {
    serviceName: 'Wan2.6 生成视频',
    provider: 'dashscope',
    creditsPerCall: 600,
    description: '使用 Wan2.6 生成视频（T2V/I2V）',
  },
  'wan26-r2v': {
    serviceName: 'Wan2.6 参考视频',
    provider: 'dashscope',
    creditsPerCall: 600,
    description: '使用 Wan2.6 参考视频生成视频',
  },
  'happyhorse-r2v-video': {
    serviceName: '快乐马多图参考',
    provider: 'dashscope',
    creditsPerCall: 600, // fallback：5s × 120 credits/s（720P，节点默认）
    description: '使用 HappyHorse 1.0 R2V 多图参考生成视频',
    dynamicPricing: {
      perSecondByResolution: { '720P': 120, '1080P': 200 },
    },
  },
  // Midjourney 服务
  'midjourney-imagine': {
    serviceName: 'Midjourney 生图',
    provider: 'midjourney',
    creditsPerCall: 50,
    description: '使用 Midjourney 生成图像',
  },
  'midjourney-variation': {
    serviceName: 'Midjourney 变体',
    provider: 'midjourney',
    creditsPerCall: 25,
    description: '生成 Midjourney 图像变体',
  },
  'midjourney-upscale': {
    serviceName: 'Midjourney 放大',
    provider: 'midjourney',
    creditsPerCall: 25,
    description: '放大 Midjourney 图像',
  },

  // 其他服务
  'background-removal': {
    serviceName: '背景移除',
    provider: 'imgly',
    creditsPerCall: 4,
    description: '移除图像背景',
  },
  'expand-image': {
    serviceName: '图像扩展',
    provider: 'gemini',
    creditsPerCall: 16,
    description: '扩展图像边界',
  },
  'convert-2d-to-3d': {
    serviceName: '2D转3D',
    provider: 'runninghub',
    creditsPerCall: 200,
    description: '将2D图像转换为3D模型',
  },

  // 更多视频服务
  'kling-video': {
    serviceName: '可灵 Kling 视频',
    provider: 'kling',
    creditsPerCall: 600,
    description: '使用可灵 Kling 生成视频',
  },
  'kling-2.6-video': {
    serviceName: '可灵 Kling 2.6 视频',
    provider: 'kling',
    creditsPerCall: 150,
    description: '使用可灵 Kling 2.6 生成视频',
    dynamicPricing: {
      noSound: {
        std: { '5': 150, '10': 300 },
        pro: { '5': 300, '10': 500 },
      },
      withSound: {
        std: { '5': 500, '10': 1000 },
        pro: { '5': 600, '10': 1200 },
      },
    },
  },
  'kling-3.0-video': {
    serviceName: '可灵 Kling 3.0 视频',
    provider: 'kling',
    creditsPerCall: 300,
    description: '使用可灵 Kling 3.0 生成视频',
    dynamicPricing: {
      noSound: {
        std: { '5': 300, '10': 600 },
        pro: { '5': 400, '10': 800 },
      },
      withSound: {
        std: { '5': 450, '10': 900 },
        pro: { '5': 600, '10': 1200 },
      },
    },
  },
  'kling-o3-video': {
    serviceName: '可灵 Kling O3 视频',
    provider: 'kling',
    creditsPerCall: 600,
    description: '使用可灵 Kling O3 (Omni Video) 生成视频',
  },
  'omni-flash-ext-video': {
    serviceName: 'Omni Flash Ext 视频',
    provider: 'omni-flash-ext',
    creditsPerCall: 600,
    description: '使用 APIMart Omni Flash Ext 生成视频',
  },
  'vidu-video': {
    serviceName: 'Vidu 视频',
    provider: 'vidu',
    creditsPerCall: 600,
    description: '使用 Vidu 生成视频',
  },
  'viduq3-pro-video': {
    serviceName: 'Vidu Q3 Pro 视频',
    provider: 'viduq3-pro',
    creditsPerCall: 400, // 默认展示：5 秒 × 80 积分/秒
    description: '使用 Vidu Q3 生成视频（按秒计费，80 积分/秒）',
    dynamicPricing: {
      creditsPerSecond: 80,
    },
  },
  'doubao-video': {
    serviceName: 'Seedance 1.5 Pro 视频',
    provider: 'doubao',
    creditsPerCall: 600,
    description: '使用Seedance 1.5 Pro 生成视频',
  },
  'video-to-gif': {
    serviceName: '视频转GIF',
    provider: 'ffmpeg',
    creditsPerCall: 30,
    description: '将视频转换为 GIF',
  },
  'minimax-speech': {
    serviceName: 'MiniMax 语音合成',
    provider: 'minimax',
    creditsPerCall: 10,
    description: '使用 MiniMax 进行文本转语音合成',
  },
  'minimax-music': {
    serviceName: 'MiniMax 音乐生成',
    provider: 'minimax',
    creditsPerCall: 30,
    description: '使用 MiniMax 进行音乐生成',
  },
  'tencent-speech': {
    serviceName: '腾讯语音合成',
    provider: 'tencent',
    creditsPerCall: 10,
    description: '使用腾讯 MPS AI 配音接口进行语音生成',
  },
  'doubao-seedream-5-0-260128': {
    serviceName: 'Seedream 5.0 图像生成',
    provider: 'seedream5',
    creditsPerCall: TAI_SEEDREAM5_RESOLUTION_PRICING['2K'],
    description: '使用 Seedream 5.0 生成图像',
    resolutionPricing: TAI_SEEDREAM5_RESOLUTION_PRICING,
  },
  'doubao-seedream-5-0-pro-260628': {
    serviceName: 'Seedream 5.0 Pro 图像生成',
    provider: 'seedream5Pro',
    creditsPerCall: TAI_SEEDREAM5_PRO_RESOLUTION_PRICING['2K'],
    description: '使用 Seedream 5.0 Pro 生成图像（更强编辑与文字能力）',
    resolutionPricing: TAI_SEEDREAM5_PRO_RESOLUTION_PRICING,
  },
} as const;

export type ServiceType = string;

// 每日登录奖励积分
export const DAILY_LOGIN_REWARD_CREDITS = 50;

// 连续签到7天额外奖励积分
export const CONSECUTIVE_7_DAY_BONUS_CREDITS = 100;

/**
 * 国际版定价倍数（来自 Token 报价单 渠道阶梯价-国际版2.0）
 *
 * 渠道折扣档位 → 上浮倍数：
 *   - 折扣 ≥ 110% → 1.6×
 *   - 折扣 ≥ 100%（<110%） → 1.5×
 *   - 折扣 < 100% → 1.0×（不变）
 *
 * 规则：未列出的 serviceType 默认为 1.0（不涨价）。
 */
export const INTERNATIONAL_PRICING_MULTIPLIER: Record<string, number> = {
  // 阿里 / 通义
  'happyhorse-r2v-video': 1.6, // 渠道 110-112%，原 1.2 → 1.6
  // 火山引擎 / 豆包
  'doubao-video': 1.6, // doubao-seedance-2-0 系列渠道 110-112%
  // 智谱
  'gemini-text': 1.5, // glm-5.2 渠道 100-102%（gemini-text 也涵盖智谱 text 通道）
  // Deepseek
  // 暂未在 serviceType 中暴露 deepseek-v4-pro，留待扩展
};

/**
 * 国际版不可用的国内专属 serviceType（在英文版时隐藏）
 *
 * 规则（依据 Token 报价单）：
 *   - 渠道折扣 ≥ 110%（如 happyhorse / doubao-seedance-2-0）→ 国际版以 1.6× 价格显示
 *   - 渠道折扣 ≥ 100%（如 glm-5.2 / deepseek-v4-pro）→ 国际版以 1.5× 价格显示
 *   - 其他国内模型（折扣 < 100%）→ 国际版完全隐藏
 *
 * 未列出的 serviceType 视为国际版可用（不阻塞，且按默认 1×）。
 */
export const DOMESTIC_ONLY_SERVICE_TYPES = new Set<string>([
  'minimax-speech',                // MiniMax speech
  'minimax-music',                 // MiniMax music
  'tencent-speech',                // 腾讯语音
  'gemini-text',                   // gemini-text 通道在国内版额外提供智谱 / Moonshot / Deepseek
  // happyhorse-r2v-video / doubao-video / doubao-seedream-* 不在此处：保留国际版可见，
  // 国际版价格走 INTERNATIONAL_PRICING_MULTIPLIER 倍数。
  // 以下如有 serviceType 在国内版才可用，应补充
]);

/**
 * 根据 serviceType 判断是否在指定版本下可用
 * @param edition 'domestic'（默认）或 'international'
 */
export function isServiceTypeAvailableForEdition(
  serviceType: string,
  edition: 'domestic' | 'international',
): boolean {
  if (edition === 'domestic') return true;
  return !DOMESTIC_ONLY_SERVICE_TYPES.has(serviceType);
}

/**
 * 获取国际版积分倍数；国内版永远返回 1
 */
export function getInternationalMultiplier(
  serviceType: string,
  edition: 'domestic' | 'international',
): number {
  if (edition === 'domestic') return 1;
  return INTERNATIONAL_PRICING_MULTIPLIER[serviceType] ?? 1;
}

/** 当前激活版本（基于 locale 推断） */
export type PricingEdition = 'domestic' | 'international';

/** locale → pricing edition */
export function resolveEditionFromLocale(locale?: string | null): PricingEdition {
  const value = String(locale || '').toLowerCase().trim();
  return value.startsWith('en') ? 'international' : 'domestic';
}
