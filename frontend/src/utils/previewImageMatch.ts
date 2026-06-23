import { isAssetKeyRef, toRenderableImageSrc } from "@/utils/imageSource";

/** 将不同形式的图片引用归一化，便于预览主图与历史列表匹配 */
export const normalizePreviewImageRef = (value?: string | null): string => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("flow-asset:")) {
    return trimmed;
  }

  const rendered = toRenderableImageSrc(trimmed) || trimmed;

  try {
    const url = new URL(
      rendered,
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    );
    const keyParam = url.searchParams.get("key");
    if (keyParam) {
      return decodeURIComponent(keyParam).replace(/^\/+/, "");
    }
    const path = url.pathname.replace(/^\/+/, "");
    if (isAssetKeyRef(path)) {
      return path;
    }
    return `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
  } catch {
    return rendered.toLowerCase();
  }
};

export const isSamePreviewImage = (
  a?: string | null,
  b?: string | null
): boolean => {
  const left = normalizePreviewImageRef(a);
  const right = normalizePreviewImageRef(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.endsWith(right) || right.endsWith(left);
};

export const findPreviewImageId = (
  imageSrc: string,
  collection: Array<{ id: string; src: string }>,
  preferredId?: string
): string => {
  if (preferredId && collection.some((item) => item.id === preferredId)) {
    return preferredId;
  }
  if (!imageSrc.trim()) return "";
  const match = collection.find((item) => isSamePreviewImage(imageSrc, item.src));
  return match?.id ?? "";
};
