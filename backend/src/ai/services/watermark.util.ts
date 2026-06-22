import {
  applyTiledWatermarkToBuffer,
  type TiledWatermarkOptions,
  type WatermarkOutputFormat,
} from "./tiled-watermark.util";

/**
 * 将 base64（或 data URL）图片添加 45° 平铺水印，返回处理后的 base64 及格式信息。
 */
function inferMimeTypeFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("data:")) return null;
  const match = /^data:([^;,]+)/i.exec(trimmed);
  return match?.[1]?.toLowerCase() || null;
}

function resolveOutputFormat(mimeType?: string | null): WatermarkOutputFormat {
  const normalized = mimeType?.trim().toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpeg";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  return "png";
}

export async function applyWatermarkToBase64(
  base64: string,
  options?: TiledWatermarkOptions
): Promise<{ data: string; mimeType: string; format: WatermarkOutputFormat }> {
  const mimeType = inferMimeTypeFromInput(base64) || "image/png";
  const outputFormat = resolveOutputFormat(mimeType);
  const dataPart = base64.startsWith("data:") ? base64.split(",")[1] : base64;
  const buffer = Buffer.from(dataPart, "base64");

  try {
    const output = await applyTiledWatermarkToBuffer(buffer, options, outputFormat);
    return {
      data: output.toString("base64"),
      mimeType:
        outputFormat === "jpeg"
          ? "image/jpeg"
          : outputFormat === "webp"
          ? "image/webp"
          : outputFormat === "gif"
          ? "image/gif"
          : "image/png",
      format: outputFormat,
    };
  } catch (error) {
    console.warn("平铺水印处理失败，返回原图:", error);
    return {
      data: dataPart,
      mimeType,
      format: outputFormat,
    };
  }
}
