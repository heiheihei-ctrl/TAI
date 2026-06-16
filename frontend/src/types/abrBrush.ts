export interface AbrBrushSample {
  width: number;
  height: number;
  alpha: Uint8Array;
}

export type AbrBrushPackId = 'dry-media' | 'comic' | 'pencil-brush';

export interface AbrBrushPreset {
  id: string;
  packId: AbrBrushPackId;
  name: string;
  baseSize: number;
  spacing: number;
  angle: number;
  roundness: number;
  opacity: number;
  flow: number;
  sample: AbrBrushSample;
  previewDataUrl: string;
}
