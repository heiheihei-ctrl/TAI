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

/** 思源宋体等 CDN 字体（每款字重独立文件） */
export const TEXT_TOOL_WEB_FONTS: TextToolFontOption[] = [
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
