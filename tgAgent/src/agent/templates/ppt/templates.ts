/**
 * 汇报 PPT 模板库（v0 内联版）。
 *
 * 三种出厂风格：简洁白 / 深色专业 / 建筑工作室
 * 每个模板定义：封面、目录、内容页（方案页/效果图页）、尾页的排版参数。
 */

export type PresentationStyle = "简洁白" | "深色专业" | "建筑工作室";

export interface PptTemplate {
  id: string;
  name: string;
  description: string;
  /** 背景色（HEX） */
  background: string;
  /** 主文字色 */
  titleColor: string;
  bodyColor: string;
  /** 强调色（用于标题块/装饰线） */
  accentColor: string;
  /** 字体 */
  titleFont: string;
  bodyFont: string;
  /** 封面配置 */
  cover: {
    titleSize: number;
    subtitleSize: number;
    layout: "centered" | "left-aligned";
  };
  /** 目录配置 */
  toc: {
    titleSize: number;
    itemSize: number;
    showPageNumbers: boolean;
  };
  /** 内容页配置 */
  content: {
    titleSize: number;
    bodySize: number;
    imageAspectRatio: "16:9" | "4:3" | "auto";
    maxImagesPerPage: number;
  };
  /** 尾页配置 */
  closing: {
    titleSize: number;
    subtitleSize: number;
  };
}

export const TEMPLATES: Record<PresentationStyle, PptTemplate> = {
  简洁白: {
    id: "clean-white",
    name: "简洁白",
    description: "白底黑字，极简排版，适合正式评审",
    background: "FFFFFF",
    titleColor: "1A1A1A",
    bodyColor: "555555",
    accentColor: "2C5282",
    titleFont: "Arial",
    bodyFont: "Arial",
    cover: {
      titleSize: 40,
      subtitleSize: 18,
      layout: "centered",
    },
    toc: {
      titleSize: 28,
      itemSize: 16,
      showPageNumbers: true,
    },
    content: {
      titleSize: 24,
      bodySize: 14,
      imageAspectRatio: "16:9",
      maxImagesPerPage: 2,
    },
    closing: {
      titleSize: 32,
      subtitleSize: 14,
    },
  },
  深色专业: {
    id: "dark-pro",
    name: "深色专业",
    description: "深色背景，金色点缀，适合高端汇报",
    background: "1A202C",
    titleColor: "F7FAFC",
    bodyColor: "E2E8F0",
    accentColor: "D69E2E",
    titleFont: "Arial",
    bodyFont: "Arial",
    cover: {
      titleSize: 40,
      subtitleSize: 18,
      layout: "centered",
    },
    toc: {
      titleSize: 28,
      itemSize: 16,
      showPageNumbers: true,
    },
    content: {
      titleSize: 24,
      bodySize: 14,
      imageAspectRatio: "16:9",
      maxImagesPerPage: 2,
    },
    closing: {
      titleSize: 32,
      subtitleSize: 14,
    },
  },
  建筑工作室: {
    id: "arch-office",
    name: "建筑工作室",
    description: "暖灰底色，衬线标题，带图纸纹理感",
    background: "F5F3EF",
    titleColor: "2D3748",
    bodyColor: "4A5568",
    accentColor: "C05621",
    titleFont: "Georgia",
    bodyFont: "Arial",
    cover: {
      titleSize: 42,
      subtitleSize: 18,
      layout: "left-aligned",
    },
    toc: {
      titleSize: 28,
      itemSize: 16,
      showPageNumbers: true,
    },
    content: {
      titleSize: 24,
      bodySize: 14,
      imageAspectRatio: "16:9",
      maxImagesPerPage: 2,
    },
    closing: {
      titleSize: 32,
      subtitleSize: 14,
    },
  },
};

export function getTemplate(style: PresentationStyle): PptTemplate {
  return TEMPLATES[style] ?? TEMPLATES["简洁白"];
}
