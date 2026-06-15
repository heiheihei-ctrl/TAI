import {
  applyTiledWatermarkToBuffer,
  type TiledWatermarkOptions,
} from "./tiled-watermark.util";

/**
 * 将 base64（或 data URL）图片添加 45° 平铺水印，返回纯 base64 字符串。
 */
export async function applyWatermarkToBase64(
  base64: string,
  options?: TiledWatermarkOptions
): Promise<string> {
  const dataPart = base64.startsWith("data:") ? base64.split(",")[1] : base64;
  const buffer = Buffer.from(dataPart, "base64");

  try {
    const output = await applyTiledWatermarkToBuffer(buffer, options);
    return output.toString("base64");
  } catch (error) {
    console.warn("平铺水印处理失败，返回原图:", error);
    return dataPart;
  }
}
