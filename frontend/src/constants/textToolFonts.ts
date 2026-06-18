/** 文本工具 CDN 字体资源根路径 */
export const TEXT_TOOL_FONT_CDN_BASE =
  'https://tai-ai.tos-cn-guangzhou.volces.com/text';

export type TextToolFontOption = {
  /** 写入 canvas / Paper.js 的 font-family 值 */
  value: string;
  labelZh: string;
  labelEn: string;
  /** 远程 TTF；有值时需先 FontFace 加载 */
  webFontUrl?: string;
  /** 该字体文件本身已是粗体，面板 Bold 开关可忽略 */
  isPresetBold?: boolean;
};

/** 思源宋体 CDN 字体 */
export const TEXT_TOOL_SOURCE_HAN_SERIF_FONTS: TextToolFontOption[] = [
  {
    value: '"Tanva Source Han Serif CN ExtraLight", "Source Han Serif CN", serif',
    labelZh: '思源宋体 特细',
    labelEn: 'Source Han Serif ExtraLight',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/SourceHanSerifCN-ExtraLight.ttf`,
  },
  {
    value: '"Tanva Source Han Serif CN Light", "Source Han Serif CN", serif',
    labelZh: '思源宋体 细体',
    labelEn: 'Source Han Serif Light',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/SourceHanSerifCN-Light.ttf`,
  },
  {
    value: '"Tanva Source Han Serif CN Regular", "Source Han Serif CN", serif',
    labelZh: '思源宋体 常规',
    labelEn: 'Source Han Serif Regular',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/SourceHanSerifCN-Regular.ttf`,
  },
  {
    value: '"Tanva Source Han Serif CN Medium", "Source Han Serif CN", serif',
    labelZh: '思源宋体 中等',
    labelEn: 'Source Han Serif Medium',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/SourceHanSerifCN-Medium.ttf`,
  },
  {
    value: '"Tanva Source Han Serif CN SemiBold", "Source Han Serif CN", serif',
    labelZh: '思源宋体 半粗',
    labelEn: 'Source Han Serif SemiBold',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/SourceHanSerifCN-SemiBold.ttf`,
  },
  {
    value: '"Tanva Source Han Serif CN Bold", "Source Han Serif CN", serif',
    labelZh: '思源宋体 粗体',
    labelEn: 'Source Han Serif Bold',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/SourceHanSerifCN-Bold.ttf`,
    isPresetBold: true,
  },
  {
    value: '"Tanva Source Han Serif CN Heavy", "Source Han Serif CN", serif',
    labelZh: '思源宋体 特粗',
    labelEn: 'Source Han Serif Heavy',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/SourceHanSerifCN-Heavy.ttf`,
    isPresetBold: true,
  },
];

/** 阿里巴巴普惠体 CDN 字体 */
export const TEXT_TOOL_ALIBABA_PUHUITI_FONTS: TextToolFontOption[] = [
  {
    value: '"Tanva Alibaba PuHuiTi Thin", "Alibaba PuHuiTi", sans-serif',
    labelZh: '普惠体 纤细',
    labelEn: 'Alibaba PuHuiTi Thin',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/AlibabaPuHuiTi-3-35-Thin.ttf`,
  },
  {
    value: '"Tanva Alibaba PuHuiTi Light", "Alibaba PuHuiTi", sans-serif',
    labelZh: '普惠体 细体',
    labelEn: 'Alibaba PuHuiTi Light',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/AlibabaPuHuiTi-3-45-Light.ttf`,
  },
  {
    value: '"Tanva Alibaba PuHuiTi Regular", "Alibaba PuHuiTi", sans-serif',
    labelZh: '普惠体 常规',
    labelEn: 'Alibaba PuHuiTi Regular',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/AlibabaPuHuiTi-3-55-Regular.ttf`,
  },
  {
    value: '"Tanva Alibaba PuHuiTi Regular L3", "Alibaba PuHuiTi", sans-serif',
    labelZh: '普惠体 常规 L3',
    labelEn: 'Alibaba PuHuiTi Regular L3',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/AlibabaPuHuiTi-3-55-RegularL3.ttf`,
  },
  {
    value: '"Tanva Alibaba PuHuiTi Medium", "Alibaba PuHuiTi", sans-serif',
    labelZh: '普惠体 中等',
    labelEn: 'Alibaba PuHuiTi Medium',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/AlibabaPuHuiTi-3-65-Medium.ttf`,
  },
  {
    value: '"Tanva Alibaba PuHuiTi SemiBold", "Alibaba PuHuiTi", sans-serif',
    labelZh: '普惠体 半粗',
    labelEn: 'Alibaba PuHuiTi SemiBold',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/AlibabaPuHuiTi-3-75-SemiBold.ttf`,
    isPresetBold: true,
  },
  {
    value: '"Tanva Alibaba PuHuiTi Bold", "Alibaba PuHuiTi", sans-serif',
    labelZh: '普惠体 粗体',
    labelEn: 'Alibaba PuHuiTi Bold',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/AlibabaPuHuiTi-3-85-Bold.ttf`,
    isPresetBold: true,
  },
  {
    value: '"Tanva Alibaba PuHuiTi ExtraBold", "Alibaba PuHuiTi", sans-serif',
    labelZh: '普惠体 特粗',
    labelEn: 'Alibaba PuHuiTi ExtraBold',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/AlibabaPuHuiTi-3-95-ExtraBold.ttf`,
    isPresetBold: true,
  },
  {
    value: '"Tanva Alibaba PuHuiTi Heavy", "Alibaba PuHuiTi", sans-serif',
    labelZh: '普惠体 超粗',
    labelEn: 'Alibaba PuHuiTi Heavy',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/AlibabaPuHuiTi-3-105-Heavy.ttf`,
    isPresetBold: true,
  },
  {
    value: '"Tanva Alibaba PuHuiTi Black", "Alibaba PuHuiTi", sans-serif',
    labelZh: '普惠体 黑体',
    labelEn: 'Alibaba PuHuiTi Black',
    webFontUrl: `${TEXT_TOOL_FONT_CDN_BASE}/AlibabaPuHuiTi-3-115-Black.ttf`,
    isPresetBold: true,
  },
];

export type TextToolFontGroup = {
  id: string;
  labelZh: string;
  labelEn: string;
  fonts: TextToolFontOption[];
};

/** 在线字体分组（供下拉面板展示） */
export const TEXT_TOOL_WEB_FONT_GROUPS: TextToolFontGroup[] = [
  {
    id: 'source-han-serif',
    labelZh: '在线字体（思源宋体）',
    labelEn: 'Web fonts (Source Han Serif)',
    fonts: TEXT_TOOL_SOURCE_HAN_SERIF_FONTS,
  },
  {
    id: 'alibaba-puhuiti',
    labelZh: '在线字体（阿里巴巴普惠体）',
    labelEn: 'Web fonts (Alibaba PuHuiTi)',
    fonts: TEXT_TOOL_ALIBABA_PUHUITI_FONTS,
  },
];

/** 全部 CDN 在线字体（扁平列表，供预加载等） */
export const TEXT_TOOL_WEB_FONTS: TextToolFontOption[] = [
  ...TEXT_TOOL_SOURCE_HAN_SERIF_FONTS,
  ...TEXT_TOOL_ALIBABA_PUHUITI_FONTS,
];

export const TEXT_TOOL_SYSTEM_FONTS: TextToolFontOption[] = [
  {
    value: '"Heiti SC", "SimHei", "黑体", sans-serif',
    labelZh: '黑体',
    labelEn: 'Heiti',
  },
  {
    value: '"PingFang SC", "Microsoft YaHei", "微软雅黑", sans-serif',
    labelZh: '苹方/微软雅黑',
    labelEn: 'PingFang / YaHei',
  },
  {
    value: '"Songti SC", "SimSun", "宋体", serif',
    labelZh: '宋体',
    labelEn: 'Songti',
  },
  {
    value: '"Kaiti SC", "KaiTi", "楷体", serif',
    labelZh: '楷体',
    labelEn: 'Kaiti',
  },
  { value: 'Inter, sans-serif', labelZh: 'Inter', labelEn: 'Inter' },
  { value: 'Arial, sans-serif', labelZh: 'Arial', labelEn: 'Arial' },
  { value: 'Helvetica, sans-serif', labelZh: 'Helvetica', labelEn: 'Helvetica' },
  { value: 'Georgia, serif', labelZh: 'Georgia', labelEn: 'Georgia' },
  { value: 'Times, serif', labelZh: 'Times', labelEn: 'Times' },
  { value: 'Courier, monospace', labelZh: 'Courier', labelEn: 'Courier' },
  { value: 'Verdana, sans-serif', labelZh: 'Verdana', labelEn: 'Verdana' },
];

export function getTextToolFontOptionByValue(
  fontFamily: string
): TextToolFontOption | undefined {
  return [...TEXT_TOOL_WEB_FONTS, ...TEXT_TOOL_SYSTEM_FONTS].find(
    (item) => item.value === fontFamily
  );
}

export function extractPrimaryFontFamily(fontFamily: string): string {
  const quoted = fontFamily.match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  return fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || fontFamily;
}
