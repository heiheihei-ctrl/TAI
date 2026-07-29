export const SOURCE_CHANNELS = [
  "小红书",
  "抖音",
  "视频号",
  "B站",
  "公众号",
  "朋友推荐",
  "AI搜索",
  "其他渠道",
] as const;

export type SourceChannel = (typeof SOURCE_CHANNELS)[number];
