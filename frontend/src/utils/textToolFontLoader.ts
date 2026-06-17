import {
  extractPrimaryFontFamily,
  getTextToolFontOptionByValue,
  TEXT_TOOL_WEB_FONTS,
} from '@/constants/textToolFonts';

const loadPromises = new Map<string, Promise<boolean>>();

function isFontReady(family: string): boolean {
  try {
    return document.fonts.check(`16px "${family}"`);
  } catch {
    return false;
  }
}

/**
 * 加载文本工具 CDN 字体；系统字体直接返回 true。
 */
export async function ensureTextToolFontLoaded(fontFamily: string): Promise<boolean> {
  const option = getTextToolFontOptionByValue(fontFamily);
  if (!option?.webFontUrl) {
    return true;
  }

  const primaryFamily = extractPrimaryFontFamily(fontFamily);
  if (isFontReady(primaryFamily)) {
    return true;
  }

  const cacheKey = option.webFontUrl;
  const pending = loadPromises.get(cacheKey);
  if (pending) {
    return pending;
  }

  const task = (async () => {
    try {
      const face = new FontFace(primaryFamily, `url(${option.webFontUrl})`, {
        weight: 'normal',
        style: 'normal',
        display: 'swap',
      });
      await face.load();
      document.fonts.add(face);
      return isFontReady(primaryFamily);
    } catch {
      return false;
    }
  })();

  loadPromises.set(cacheKey, task);
  return task;
}

export function preloadTextToolWebFonts(): void {
  if (typeof document === 'undefined') return;
  for (const font of TEXT_TOOL_WEB_FONTS) {
    void ensureTextToolFontLoaded(font.value);
  }
}
