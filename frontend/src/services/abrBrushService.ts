import { readAbr, type SampleInfo } from 'ag-psd';
import { ABR_BRUSH_REMOTE_URLS } from '@/config/abrBrushAssets';
import type { AbrBrushPackId, AbrBrushPreset } from '@/types/abrBrush';
import { proxifyRemoteAssetUrl } from '@/utils/assetProxy';
import { logger } from '@/utils/logger';
import { stripAbrPatternSections } from '@/utils/stripAbrPatternSections';

let cachedPresets: AbrBrushPreset[] | null = null;
let loadPromise: Promise<AbrBrushPreset[]> | null = null;

const ABR_PACKS: Array<{ id: AbrBrushPackId; url: string; stripPatterns?: boolean }> = [
  { id: 'dry-media', url: ABR_BRUSH_REMOTE_URLS['dry-media'] },
  { id: 'comic', url: ABR_BRUSH_REMOTE_URLS.comic },
  { id: 'pencil-brush', url: ABR_BRUSH_REMOTE_URLS['pencil-brush'], stripPatterns: true },
];

const createPreviewDataUrl = (sample: SampleInfo): string => {
  const { w, h } = sample.bounds;
  const previewSize = 48;
  const canvas = document.createElement('canvas');
  canvas.width = previewSize;
  canvas.height = previewSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const temp = document.createElement('canvas');
  temp.width = w;
  temp.height = h;
  const tempCtx = temp.getContext('2d');
  if (!tempCtx) return '';

  const imageData = tempCtx.createImageData(w, h);
  for (let i = 0; i < sample.alpha.length; i++) {
    const value = sample.alpha[i];
    const offset = i * 4;
    imageData.data[offset] = value;
    imageData.data[offset + 1] = value;
    imageData.data[offset + 2] = value;
    imageData.data[offset + 3] = 255;
  }
  tempCtx.putImageData(imageData, 0, 0);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, previewSize, previewSize);
  const scale = Math.min(previewSize / w, previewSize / h) * 0.85;
  const drawW = w * scale;
  const drawH = h * scale;
  ctx.drawImage(
    temp,
    (previewSize - drawW) / 2,
    (previewSize - drawH) / 2,
    drawW,
    drawH,
  );

  return canvas.toDataURL('image/png');
};

const parseAbrPack = (
  buffer: ArrayBuffer,
  packId: AbrBrushPackId,
  stripPatterns = false,
): AbrBrushPreset[] => {
  const bytes = stripPatterns ? stripAbrPatternSections(buffer) : new Uint8Array(buffer);
  const abr = readAbr(bytes);
  const sampleMap = new Map(abr.samples.map((sample) => [sample.id, sample]));

  return abr.brushes
    .filter((brush) => brush.shape.type === 'sampled')
    .map((brush, index) => {
      const shape = brush.shape;
      if (shape.type !== 'sampled') {
        throw new Error('Unexpected brush shape');
      }

      const sample = sampleMap.get(shape.sampledData);
      if (!sample) {
        throw new Error(`Missing brush sample: ${shape.sampledData}`);
      }

      return {
        id: `${packId}-${index}`,
        packId,
        name: brush.name,
        baseSize: shape.size,
        spacing: shape.spacingOn ? Math.max(0.01, shape.spacing) : 0.25,
        angle: shape.angle,
        roundness: Math.max(0.05, shape.roundness),
        opacity: (brush.toolOptions?.opacity ?? 100) / 100,
        flow: (brush.toolOptions?.flow ?? 100) / 100,
        sample: {
          width: sample.bounds.w,
          height: sample.bounds.h,
          alpha: sample.alpha,
        },
        previewDataUrl: createPreviewDataUrl(sample),
      };
    });
};

const loadAbrPack = async ({
  id,
  url,
  stripPatterns = false,
}: (typeof ABR_PACKS)[number]): Promise<AbrBrushPreset[]> => {
  const response = await fetch(proxifyRemoteAssetUrl(url));
  if (!response.ok) {
    throw new Error(`Failed to load ${id}.abr (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return parseAbrPack(buffer, id, stripPatterns);
};

export const loadAbrBrushes = async (): Promise<AbrBrushPreset[]> => {
  if (cachedPresets) return cachedPresets;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const packs = await Promise.all(
      ABR_PACKS.map(async (pack) => {
        try {
          return await loadAbrPack(pack);
        } catch (error) {
          logger.warn(`Failed to load ${pack.id}.abr`, error);
          return [];
        }
      }),
    );

    cachedPresets = packs.flat();
    return cachedPresets;
  })();

  return loadPromise;
};

export const loadDryMediaBrushes = loadAbrBrushes;

export const getAbrBrushById = async (
  brushId: string | null,
): Promise<AbrBrushPreset | null> => {
  if (!brushId) return null;
  const presets = await loadAbrBrushes();
  return presets.find((preset) => preset.id === brushId) ?? null;
};

export const getDryMediaBrushById = getAbrBrushById;
