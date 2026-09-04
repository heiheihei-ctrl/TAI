/** ToAPIs 普通路线参考图体积上限：单张 ≤10MB（与上游 mirror 限制一致；不是多图合计） */
export const TOAPIS_REFERENCE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export function formatToapisReferenceImageSizeError(
  bytes: number,
  label = '参考图',
): string {
  const sizeMb = (bytes / 1024 / 1024).toFixed(1);
  return `${label}单张超过 ToAPIs 10MB 限制（当前约 ${sizeMb}MB），请压缩后重试`;
}
