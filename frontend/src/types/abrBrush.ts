export interface AbrBrushSample {
  width: number;
  height: number;
  alpha: Uint8Array;
}

export interface AbrBrushPreset {
  id: string;
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
