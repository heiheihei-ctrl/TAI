let cachedSupported: boolean | null = null;

/**
 * 检测当前环境是否支持位图 ABR 笔刷（Canvas 2D + ImageData）。
 * 老旧/低配设备可能无法稳定运行，应降级为矢量笔。
 */
export const isBitmapBrushSupported = (): boolean => {
  if (cachedSupported !== null) return cachedSupported;

  if (typeof document === 'undefined') {
    cachedSupported = false;
    return cachedSupported;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      cachedSupported = false;
      return cachedSupported;
    }

    const imageData = ctx.createImageData(64, 64);
    if (!imageData?.data?.length) {
      cachedSupported = false;
      return cachedSupported;
    }

    ctx.putImageData(imageData, 0, 0);
    cachedSupported = true;
    return cachedSupported;
  } catch {
    cachedSupported = false;
    return cachedSupported;
  }
};
