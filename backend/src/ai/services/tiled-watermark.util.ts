import { loadSharp, isSharpAvailable, getSharpLoadError } from '../../utils/sharp-loader';
import type sharp from 'sharp';

const DEFAULT_WATERMARK_ANGLE = -45;
const DEFAULT_WATERMARK_OPACITY = 0.22;
const DEFAULT_WATERMARK_TILE_SCALE = 0.16;
const DEFAULT_WATERMARK_TEXT = "Tanvas AI";
const DEFAULT_HORIZONTAL_GAP_RATIO = 0.55;
const DEFAULT_VERTICAL_GAP_RATIO = 0.42;

export type TiledWatermarkOptions = {
  text?: string;
  angle?: number;
  opacity?: number;
  tileScale?: number;
};

export type WatermarkOutputFormat = "png" | "jpeg" | "webp" | "gif";

type TextStamp = {
  buffer: Buffer;
  width: number;
  height: number;
};

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveTiledWatermarkConfig(options?: TiledWatermarkOptions) {
  return {
    text: options?.text ?? process.env.WATERMARK_TEXT ?? DEFAULT_WATERMARK_TEXT,
    angle: options?.angle ?? readNumberEnv("WATERMARK_ANGLE", DEFAULT_WATERMARK_ANGLE),
    opacity:
      options?.opacity ?? readNumberEnv("WATERMARK_OPACITY", DEFAULT_WATERMARK_OPACITY),
    tileScale:
      options?.tileScale ??
      readNumberEnv("WATERMARK_TILE_SCALE", DEFAULT_WATERMARK_TILE_SCALE),
    horizontalGapRatio: readNumberEnv(
      "WATERMARK_HORIZONTAL_GAP_RATIO",
      DEFAULT_HORIZONTAL_GAP_RATIO
    ),
    verticalGapRatio: readNumberEnv(
      "WATERMARK_VERTICAL_GAP_RATIO",
      DEFAULT_VERTICAL_GAP_RATIO
    ),
  };
}

function getSharp(): typeof sharp {
  const sharpModule = loadSharp();
  if (!sharpModule) {
    throw new Error(getSharpLoadError() ?? 'sharp 不可用');
  }
  return sharpModule as typeof sharp;
}

async function applyOpacityToPng(buffer: Buffer, opacity: number): Promise<Buffer> {
  const sharp = getSharp();
  const clampedOpacity = Math.min(1, Math.max(0, opacity));
  if (clampedOpacity >= 0.999) {
    return buffer;
  }

  const processed = await sharp(buffer).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const { data, info } = processed;

  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * clampedOpacity);
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

function buildTextTileSvg(
  text: string,
  canvasSize: number,
  angle: number,
  fontSize: number
): string {
  const center = Math.round(canvasSize / 2);
  const escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return `
<svg width="${canvasSize}" height="${canvasSize}" xmlns="http://www.w3.org/2000/svg">
  <text
    x="50%"
    y="50%"
    transform="rotate(${angle} ${center} ${center})"
    text-anchor="middle"
    dominant-baseline="middle"
    font-size="${fontSize}"
    font-family="Arial, Helvetica, sans-serif"
    font-weight="600"
    letter-spacing="0.08em"
    fill="#ffffff"
  >${escapedText}</text>
</svg>`;
}

async function buildTextStamp(
  text: string,
  shortSide: number,
  angle: number,
  opacity: number
): Promise<TextStamp> {
  const sharp = getSharp();
  const fontSize = Math.max(16, Math.round(shortSide * 0.028));
  const approxTextWidth = text.length * fontSize * 0.62;
  const canvasSize = Math.ceil(Math.max(approxTextWidth, fontSize * 2) * 1.8);
  const svg = buildTextTileSvg(text, canvasSize, angle, fontSize);

  let buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  buffer = await applyOpacityToPng(buffer, opacity);
  buffer = await sharp(buffer).trim().png().toBuffer();

  const metadata = await sharp(buffer).metadata();
  return {
    buffer,
    width: metadata.width ?? canvasSize,
    height: metadata.height ?? canvasSize,
  };
}

async function buildStaggeredPatternUnit(
  stamp: TextStamp,
  colStep: number,
  rowStep: number
): Promise<Buffer> {
  const sharp = getSharp();
  const patternWidth = colStep;
  const patternHeight = rowStep * 2;
  const row0Left = Math.max(0, Math.round((colStep - stamp.width) / 2));
  const row1Left = Math.max(0, Math.round(colStep / 2 + (colStep - stamp.width) / 2));

  return sharp({
    create: {
      width: patternWidth,
      height: patternHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: stamp.buffer, left: row0Left, top: 0 },
      { input: stamp.buffer, left: row1Left, top: rowStep },
    ])
    .png()
    .toBuffer();
}

async function buildStaggeredWatermarkOverlay(
  width: number,
  height: number,
  options?: TiledWatermarkOptions
): Promise<Buffer> {
  const config = resolveTiledWatermarkConfig(options);
  const shortSide = Math.min(width, height);
  const stamp = await buildTextStamp(
    config.text,
    Math.max(96, Math.round(shortSide * config.tileScale)),
    config.angle,
    config.opacity
  );

  const colStep = Math.max(
    stamp.width + 8,
    Math.round(stamp.width * (1 + config.horizontalGapRatio))
  );
  const rowStep = Math.max(
    stamp.height + 8,
    Math.round(stamp.height * (1 + config.verticalGapRatio))
  );
  const pattern = await buildStaggeredPatternUnit(stamp, colStep, rowStep);

  const sharp = getSharp();
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: pattern, tile: true }])
    .png()
    .toBuffer();
}

export async function buildTiledWatermarkUnit(
  shortSide: number,
  options?: TiledWatermarkOptions
): Promise<Buffer> {
  const config = resolveTiledWatermarkConfig(options);
  const stamp = await buildTextStamp(
    config.text,
    Math.max(96, Math.round(shortSide * config.tileScale)),
    config.angle,
    config.opacity
  );
  return stamp.buffer;
}

export async function createFullTiledWatermarkOverlay(
  width: number,
  height: number,
  options?: TiledWatermarkOptions
): Promise<Buffer | null> {
  if (!width || !height) return null;
  return buildStaggeredWatermarkOverlay(width, height, options);
}

export async function applyTiledWatermarkToBuffer(
  imageBuffer: Buffer,
  options?: TiledWatermarkOptions,
  outputFormat?: WatermarkOutputFormat
): Promise<Buffer> {
  if (!isSharpAvailable()) {
    throw new Error(getSharpLoadError() ?? 'sharp 不可用，跳过水印');
  }

  const sharp = getSharp();
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!width || !height) {
    return imageBuffer;
  }

  const overlay = await buildStaggeredWatermarkOverlay(width, height, options);
  const pipeline = sharp(imageBuffer, { animated: outputFormat === "gif" })
    .composite([{ input: overlay, left: 0, top: 0 }]);

  switch (outputFormat) {
    case "jpeg":
      return pipeline.jpeg().toBuffer();
    case "webp":
      return pipeline.webp().toBuffer();
    case "gif":
      return pipeline.gif().toBuffer();
    case "png":
    default:
      return pipeline.png().toBuffer();
  }
}
