const normalizeBaseUrl = (raw: string | undefined): string => {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return 'https://tai-ai.tos-cn-guangzhou.volces.com/brush';
  return trimmed.replace(/\/+$/, '');
};

export const ABR_BRUSH_OSS_BASE = normalizeBaseUrl(
  import.meta.env.VITE_ABR_BRUSH_OSS_BASE as string | undefined,
);

export const ABR_BRUSH_REMOTE_URLS = {
  'dry-media': `${ABR_BRUSH_OSS_BASE}/dry_media.abr`,
  comic: `${ABR_BRUSH_OSS_BASE}/${encodeURIComponent('Comic brush.abr')}`,
  'pencil-brush': `${ABR_BRUSH_OSS_BASE}/${encodeURIComponent('Pencil brush.abr')}`,
} as const;
