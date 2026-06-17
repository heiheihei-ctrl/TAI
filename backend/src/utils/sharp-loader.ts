/**
 * 延迟加载 sharp：优先原生绑定，失败时尝试 wasm（无需 .node 文件）。
 * 供水印、抠图等模块统一使用，避免顶层 import 导致启动即崩溃。
 */

let sharpModule: ((...args: unknown[]) => unknown) | null | undefined;
let loadError: string | undefined;

export function isSharpAvailable(): boolean {
  return loadSharp() !== null;
}

export function getSharpLoadError(): string | undefined {
  if (sharpModule !== undefined) {
    return sharpModule ? undefined : loadError;
  }
  loadSharp();
  return loadError;
}

export function loadSharp(): ((...args: unknown[]) => unknown) | null {
  if (sharpModule !== undefined) {
    return sharpModule;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('sharp');
    const resolved = (mod as { default?: unknown }).default ?? mod;
    if (typeof resolved === 'function') {
      sharpModule = resolved as (...args: unknown[]) => unknown;
      loadError = undefined;
      return sharpModule;
    }
    loadError = 'sharp export is not a function';
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  sharpModule = null;
  return null;
}

export function requireSharp(): NonNullable<ReturnType<typeof loadSharp>> {
  const sharp = loadSharp();
  if (!sharp) {
    throw new Error(
      loadError
        ? `sharp 不可用: ${loadError}`
        : 'sharp 不可用，请安装 @img/sharp-linux-x64 或 @img/sharp-wasm32'
    );
  }
  return sharp;
}
