export const FLOW_NODE_DEFAULT_SIZE = {
  nodeGroup: { w: 220, h: 160 },
  textPrompt: { w: 240, h: 180 },
  textPromptPro: { w: 420, h: 360 },
  textNote: { w: 220, h: 140 },
  textChat: { w: 320, h: 540 },
  promptOptimize: { w: 360, h: 300 },
  image: { w: 260, h: 240 },
  imagePro: { w: 320, h: 240 },
  generate: { w: 300, h: 320 },
  generatePro: { w: 320, h: 400 },
  generatePro4: { w: 380, h: 480 },
  generate4: { w: 300, h: 320 },
  generateRef: { w: 280, h: 320 },
  three: { w: 560, h: 320 },
  viewAngle: { w: 420, h: 560 },
  camera: { w: 260, h: 220 },
  analysis: { w: 260, h: 280 },
  sora2Video: { w: 280, h: 260 },
  sora2Character: { w: 300, h: 320 },
  wan26: { w: 300, h: 320 },
  wan2R2V: { w: 300, h: 360 },
  happyhorseR2V: { w: 300, h: 460 },
  wan27Video: { w: 300, h: 420 },
  klingVideo: { w: 280, h: 260 },
  kling26Video: { w: 280, h: 260 },
  kling30Video: { w: 280, h: 260 },
  klingO1Video: { w: 280, h: 380 },
  klingO3Video: { w: 280, h: 380 },
  viduVideo: { w: 280, h: 260 },
  viduQ3: { w: 280, h: 260 },
  doubaoVideo: { w: 280, h: 260 },
  seedance20Video: { w: 280, h: 260 },
  omniFlashExtVideo: { w: 300, h: 340 },
  storyboardSplit: { w: 320, h: 400 },
  midjourney: { w: 280, h: 320 },
  midjourneyV7: { w: 300, h: 400 },
  niji7: { w: 300, h: 400 },
  nano2: { w: 260, h: 200 },
  gptImage2: { w: 260, h: 200 },
  seedream5: { w: 260, h: 240 },
  video: { w: 320, h: 280 },
  audioUpload: { w: 320, h: 128 },
  videoAnalyze: { w: 280, h: 360 },
  videoFrameExtract: { w: 300, h: 420 },
  videoToGif: { w: 320, h: 420 },
  imageGrid: { w: 300, h: 380 },
  imageSplit: { w: 320, h: 400 },
  imageCompress: { w: 300, h: 360 },
  minimaxSpeech: { w: 280, h: 240 },
  tencentSpeech: { w: 300, h: 400 },
  minimaxMusic: { w: 300, h: 460 },
} as const;

export type FlowNodeTypeKey = keyof typeof FLOW_NODE_DEFAULT_SIZE;

const FALLBACK_SIZE = { w: 220, h: 160 } as const;

export function getFlowNodeDefaultSize(type?: string | null): { w: number; h: number } {
  if (!type) return { ...FALLBACK_SIZE };
  if (type in FLOW_NODE_DEFAULT_SIZE) {
    return FLOW_NODE_DEFAULT_SIZE[type as FlowNodeTypeKey];
  }
  return { ...FALLBACK_SIZE };
}
