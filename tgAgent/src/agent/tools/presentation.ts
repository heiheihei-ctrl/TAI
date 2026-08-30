/**
 * create_presentation —— 汇报 PPT 编排（pptxgenjs 实现版）
 *
 * 根据 DesignBrief + 画布效果图自动生成建筑汇报 PPT。
 * 生成流程：模板选型 → 拼装封面/目录/方案页/尾页 → 落盘 → 注册资产 → 推送 presentation.ready
 */

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { defineTool, Type } from "../piCompat.js";
import type { ToolContext } from "./context.js";
import { getTemplate, type PresentationStyle } from "../templates/ppt/templates.js";
import type { DesignBrief } from "../../shared/brief.js";
import type { Asset } from "../../shared/assets.js";

// pptxgenjs 的 class + namespace 同名模式在 TS 中会导致构造签名丢失，
// 这里用一个窄接口绕过，运行时仍使用真正的 PptxGenJS。
interface PptxSlide {
  addText(text: string, options?: Record<string, unknown>): void;
  addShape(shapeType: Record<string, unknown>, options?: Record<string, unknown>): void;
  addImage(options: { path: string; x: number; y: number; w: number; h: number }): void;
  background: { color: string };
}

interface PptxInstance {
  slides: { length: number };
  layout: string;
  ShapeType: { rect: Record<string, unknown> };
  addSlide(): PptxSlide;
  writeFile(props: { fileName: string }): Promise<void>;
}

type PptxGenJSConstructor = new () => PptxInstance;

export function createPresentationTool(ctx: ToolContext) {
  return defineTool({
    name: "create_presentation",
    label: "生成汇报 PPT",
    description: [
      "根据项目设计档案自动编排汇报 PPT，自动填入封面/目录/方案页/效果图页/尾页。",
      "params: {",
      "  title: string,                    // 汇报标题",
      "  outline?: string[],               // 自定大纲；留空则按模板自动编排",
      "  assetIds?: string[],              // 要插入效果图的资产 ID（按页面顺序）",
      "  style?: \"简洁白\"|\"深色专业\"|\"建筑工作室\",  // 默认\"简洁白\"",
      "  pageCount?: number,              // 期望页数，默认按大纲自动",
      "}",
      "returns: { presentationId, status:\"generating\" }",
      "完成后推送 presentation.ready 事件。",
    ].join("\n"),
    parameters: Type.Object({
      title: Type.String({ description: "汇报标题" }),
      outline: Type.Optional(
        Type.Array(Type.String(), { description: "大纲；留空则按模板自动编排" }),
      ),
      assetIds: Type.Optional(
        Type.Array(Type.String(), { description: "效果图资产 ID（按页面顺序）" }),
      ),
      style: Type.Optional(
        Type.Union([
          Type.Literal("简洁白"),
          Type.Literal("深色专业"),
          Type.Literal("建筑工作室"),
        ], { description: "模板风格，默认简洁白" }),
      ),
      pageCount: Type.Optional(
        Type.Number({ description: "期望页数，默认按大纲自动" }),
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate) => {
      const brief = ctx.getBrief();
      const imageAssets: Asset[] = (params.assetIds ?? [])
        .map((id) => ctx.assets.get(id))
        .filter((a): a is Asset => !!a && !a.deleted && a.kind === "image");

      const style: PresentationStyle = params.style ?? "简洁白";
      const template = getTemplate(style);
      const outline = params.outline ?? buildDefaultOutline(brief);

      const pptxModule = await import("pptxgenjs");
      const PptxConstructor = (pptxModule.default ?? pptxModule) as unknown as PptxGenJSConstructor;
      const pptx: PptxInstance = new PptxConstructor();
      pptx.layout = "LAYOUT_16x9";

      addCoverSlide(pptx, template, params.title, brief);
      addTocSlide(pptx, template, outline);

      for (let i = 0; i < outline.length; i++) {
        const sectionImages = pickImagesForSection(imageAssets, i, outline.length);
        addContentSlide(pptx, template, outline[i]!, sectionImages, brief);
      }

      addClosingSlide(pptx, template);

      const filename = `presentation_${Date.now()}.pptx`;
      const outDir = path.join(process.cwd(), ".mock-assets", "presentations");
      await mkdir(outDir, { recursive: true });
      const outPath = path.join(outDir, filename);
      await pptx.writeFile({ fileName: outPath });

      const asset = ctx.assets.register({
        projectId: ctx.projectId,
        kind: "presentation",
        url: `/mock-assets/presentations/${filename}`,
        operation: "presentation",
        meta: {
          title: params.title,
          style,
          totalSlides: pptx.slides.length,
          outline,
        },
      });

      ctx.emit({
        type: "presentation.ready",
        sessionId: ctx.sessionId,
        presentationId: asset.id,
        url: asset.url,
        totalPages: pptx.slides.length,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `汇报 PPT 已生成：${params.title}，共 ${pptx.slides.length} 页。`,
          },
        ],
        details: {
          presentationId: asset.id,
          totalPages: pptx.slides.length,
        } as const,
      };
    },
  });
}

function buildDefaultOutline(brief: DesignBrief): string[] {
  const sections: string[] = [];
  if (brief.projectType) sections.push(`项目概况：${brief.projectType}`);
  if (brief.massing) sections.push(`体量与规模：${brief.massing}`);
  if (brief.styleKeywords.length > 0) sections.push(`设计风格：${brief.styleKeywords.join("、")}`);
  if (brief.materials.length > 0) sections.push(`材质策略：${brief.materials.join("、")}`);
  if (brief.context) sections.push(`环境语境：${brief.context}`);
  if (brief.lighting || brief.camera) sections.push(`呈现方式：${brief.lighting ?? ""}${brief.camera ?? ""}`);
  if (brief.mood) sections.push(`氛围意向：${brief.mood}`);
  return sections.length > 0 ? sections : ["项目概述", "设计方案", "效果展示", "总结"];
}

function pickImagesForSection(imageAssets: Asset[], sectionIndex: number, totalSections: number): Asset[] {
  if (imageAssets.length === 0 || totalSections <= 0) return [];
  const perSection = Math.ceil(imageAssets.length / totalSections);
  const start = sectionIndex * perSection;
  return imageAssets.slice(start, start + perSection);
}

function addCoverSlide(
  pptx: PptxInstance,
  template: ReturnType<typeof getTemplate>,
  title: string,
  brief: DesignBrief,
) {
  const slide: PptxSlide = pptx.addSlide();
  slide.background = { color: template.background };

  slide.addText(title, {
    x: 0.5,
    y: 2.5,
    w: 9,
    h: 1.5,
    fontSize: template.cover.titleSize,
    color: template.titleColor,
    fontFace: template.titleFont,
    bold: true,
    align: "center",
  });

  const subtitle = brief.projectType
    ? `${brief.projectType}${brief.camera ? " · " + brief.camera : ""}${brief.lighting ? " · " + brief.lighting : ""}`
    : "建筑设计方案汇报";
  slide.addText(subtitle, {
    x: 0.5,
    y: 4.0,
    w: 9,
    h: 0.8,
    fontSize: template.cover.subtitleSize,
    color: template.bodyColor,
    fontFace: template.bodyFont,
    align: "center",
  });
}

function addTocSlide(
  pptx: PptxInstance,
  template: ReturnType<typeof getTemplate>,
  outline: string[],
) {
  const slide: PptxSlide = pptx.addSlide();
  slide.background = { color: template.background };

  slide.addText("目录", {
    x: 0.5,
    y: 0.5,
    w: 9,
    h: 0.8,
    fontSize: template.toc.titleSize,
    color: template.titleColor,
    fontFace: template.titleFont,
    bold: true,
  });

  outline.forEach((item, i) => {
    slide.addText(`${i + 1}.  ${item}`, {
      x: 0.5,
      y: 1.5 + i * 0.6,
      w: 9,
      h: 0.5,
      fontSize: template.toc.itemSize,
      color: template.bodyColor,
      fontFace: template.bodyFont,
    });
  });
}

function addContentSlide(
  pptx: PptxInstance,
  template: ReturnType<typeof getTemplate>,
  title: string,
  images: Asset[],
  brief: DesignBrief,
) {
  const slide: PptxSlide = pptx.addSlide();
  slide.background = { color: template.background };

  slide.addText(title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.8,
    fontSize: template.content.titleSize,
    color: template.titleColor,
    fontFace: template.titleFont,
    bold: true,
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5,
    y: 1.1,
    w: 9,
    h: 0.03,
    fill: { color: template.accentColor },
  });

  const summary = buildBriefSummary(brief);
  slide.addText(summary, {
    x: 0.5,
    y: 1.3,
    w: images.length > 0 ? 5.2 : 9,
    h: 5,
    fontSize: template.content.bodySize,
    color: template.bodyColor,
    fontFace: template.bodyFont,
    valign: "top",
    wrap: true,
  });

  if (images.length > 0) {
    const imgStartX = 6.0;
    const imgStartY = 1.3;
    const imgW = 3.2;
    const imgH = imgW * 9 / 16;

    const maxImages = Math.min(images.length, template.content.maxImagesPerPage);
    for (let i = 0; i < maxImages; i++) {
      const img = images[i]!;
      try {
        const imagePath = img.url.startsWith("http")
          ? img.url
          : path.join(process.cwd(), img.url.replace(/^\//, ""));
        slide.addImage({
          path: imagePath,
          x: imgStartX + (i % 2) * (imgW + 0.15),
          y: imgStartY + Math.floor(i / 2) * (imgH + 0.15),
          w: imgW,
          h: imgH,
        });
      } catch {
        // skip broken image
      }
    }
  }
}

function addClosingSlide(
  pptx: PptxInstance,
  template: ReturnType<typeof getTemplate>,
) {
  const slide: PptxSlide = pptx.addSlide();
  slide.background = { color: template.background };

  slide.addText("感谢聆听", {
    x: 0.5,
    y: 2.5,
    w: 9,
    h: 1.2,
    fontSize: template.closing.titleSize,
    color: template.titleColor,
    fontFace: template.titleFont,
    bold: true,
    align: "center",
  });

  slide.addText("天宫TAI · AI 设计合伙人", {
    x: 0.5,
    y: 3.8,
    w: 9,
    h: 0.6,
    fontSize: template.closing.subtitleSize,
    color: template.bodyColor,
    fontFace: template.bodyFont,
    align: "center",
  });
}

function buildBriefSummary(brief: DesignBrief): string {
  const parts: string[] = [];
  if (brief.projectType) parts.push(`项目类型：${brief.projectType}`);
  if (brief.massing) parts.push(`体量规模：${brief.massing}`);
  if (brief.styleKeywords.length > 0) parts.push(`设计风格：${brief.styleKeywords.join("、")}`);
  if (brief.materials.length > 0) parts.push(`主要材质：${brief.materials.join("、")}`);
  if (brief.context) parts.push(`环境语境：${brief.context}`);
  if (brief.lighting) parts.push(`光照时段：${brief.lighting}`);
  if (brief.camera) parts.push(`视角：${brief.camera}`);
  if (brief.mood) parts.push(`氛围意向：${brief.mood}`);
  if (brief.freeText) parts.push(`补充说明：${brief.freeText}`);
  return parts.join("\n");
}
