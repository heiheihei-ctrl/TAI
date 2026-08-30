/**
 * 局部区域矩形：像素坐标 ↔ 归一化（0–1）互转。
 *
 * ## 重要：归一化坐标不是模型入参
 *
 * TAI 平台的「精准编辑 / 局部重绘」**不把区域发给后端**——`EditImageDto` 里没有任何
 * crop / mask 字段。真实流程是：
 *   1. 前端把**原图整张**的 URL 作为 `sourceImageUrl` 提交，让模型整图重绘
 *      （aiChatStore.ts:4438）；
 *   2. 模型返回整图后，前端用 canvas 按 `cropRectNormalized` 把结果合成回原图
 *      （`mergePrecisePatchIntoImage` aiChatStore.ts:718，核心是 :770 的
 *      `ctx.drawImage(patchImage, cropX, cropY, cropWidth, cropHeight)`）。
 *
 * 所以归一化矩形是**前端合成用的**，后端完全不知道用户框了哪里。
 *
 * tgagent 保留该字段的意义：
 *   ① 与 TAI 契约对齐（`PreciseEditContext.cropRectNormalized`）；
 *   ② 供 prompt 组装说明「改哪里」，弥补模型侧拿不到区域信息的缺憾；
 *   ③ 未来自建前端时可复用合成逻辑。
 *
 * 量纲差异是接入期的高危点：qianduan 原型上报**像素**，TAI 前端上报**归一化**。
 * 两者混用不会报错，只会让区域静默错位。
 */

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 像素矩形 → 归一化。
 * 缺少图片宽高（或宽高非法）时返回 undefined——此时调用方应保留像素坐标或跳过，
 * 不要猜测一个默认值，那会造成静默错位。
 */
export function toNormalizedRect(
  rect: PixelRect,
  imageWidth?: number,
  imageHeight?: number,
): NormalizedRect | undefined {
  if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) return undefined;
  return {
    x: clamp01(rect.x / imageWidth),
    y: clamp01(rect.y / imageHeight),
    width: clamp01(rect.w / imageWidth),
    height: clamp01(rect.h / imageHeight),
  };
}

/** 归一化 → 像素矩形。宽高至少为 1px，避免出现零尺寸区域。 */
export function toPixelRect(
  rect: NormalizedRect,
  imageWidth: number,
  imageHeight: number,
): PixelRect {
  return {
    x: Math.round(clamp01(rect.x) * imageWidth),
    y: Math.round(clamp01(rect.y) * imageHeight),
    w: Math.max(1, Math.round(clamp01(rect.width) * imageWidth)),
    h: Math.max(1, Math.round(clamp01(rect.height) * imageHeight)),
  };
}

/**
 * 从 SelectionRef 上解析出归一化区域（若可解析）。
 * 优先用已有的归一化字段；否则尝试用像素坐标 + 图片宽高换算。
 */
export function resolveNormalizedRegion(params: {
  regionRect?: PixelRect;
  normalizedRegion?: NormalizedRect;
  imageWidth?: number;
  imageHeight?: number;
}): NormalizedRect | undefined {
  if (params.normalizedRegion) return params.normalizedRegion;
  if (params.regionRect) {
    return toNormalizedRect(params.regionRect, params.imageWidth, params.imageHeight);
  }
  return undefined;
}
