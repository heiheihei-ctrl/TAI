import type { DragEvent as ReactDragEvent } from "react";

export const TANVA_ASSET_MIME = "application/x-tanva-asset";
export const TANVA_ASSETS_BATCH_MIME = "application/x-tanva-assets";

export type TanvaDragAssetPayload = Record<string, unknown> & {
  type: "2d" | "3d" | "svg" | "video";
  id: string;
  url?: string;
};

export const applyTanvaDragPayloads = (
  event: ReactDragEvent,
  payloads: TanvaDragAssetPayload[]
) => {
  if (payloads.length === 0) return;
  const primary = payloads[0]!;
  if (typeof primary.url === "string" && primary.url.trim()) {
    event.dataTransfer.setData("text/uri-list", primary.url);
    event.dataTransfer.setData("text/plain", primary.url);
  }
  if (payloads.length === 1) {
    event.dataTransfer.setData(TANVA_ASSET_MIME, JSON.stringify(primary));
  } else {
    event.dataTransfer.setData(TANVA_ASSETS_BATCH_MIME, JSON.stringify(payloads));
    event.dataTransfer.setData(TANVA_ASSET_MIME, JSON.stringify(primary));
  }
  event.dataTransfer.effectAllowed = "copy";
};

export const LIBRARY_DROP_GRID_GAP = 48;

export const getLibraryDropOffset = (
  index: number,
  total: number,
  origin: { x: number; y: number }
): { x: number; y: number } => {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: origin.x + col * LIBRARY_DROP_GRID_GAP,
    y: origin.y + row * LIBRARY_DROP_GRID_GAP,
  };
};
