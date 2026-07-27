/** 阿里云内容安全增强版默认服务码（与开通项一致） */
export const ALIYUN_GREEN_DEFAULTS = {
  textService: 'ugc_moderation_byllm_pro',
  imageService: 'baselineCheck',
  videoService: 'videoDetection',
  endpoint: 'green-cip.cn-shanghai.aliyuncs.com',
  regionId: 'cn-shanghai',
  blockRiskLevels: ['high', 'medium'] as const,
  blockMessage: '内容包含敏感或违规信息，已被平台拦截。请修改提示词或素材后重试。',
};

export type ContentModerationSource =
  | 'prompt'
  | 'input_image'
  | 'input_video'
  | 'generated_text'
  | 'generated_image'
  | 'generated_video'
  | 'none';

export interface ContentModerationDecision {
  blocked: boolean;
  source: ContentModerationSource;
  riskLevel?: string;
  labels?: string[];
  message: string;
  providerRequestId?: string;
  rawSummary?: string;
}
