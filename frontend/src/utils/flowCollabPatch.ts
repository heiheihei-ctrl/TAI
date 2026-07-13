import type { Node } from 'reactflow';

const BASE64_IMAGE_MAGIC_PREFIXES = [
  'iVBORw0KGgo',
  '/9j/',
  'R0lGOD',
  'UklGR',
  'PHN2Zy',
];

function looksLikeBase64(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  if (compact.length < 4096) return false;
  if (compact.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
}

function isPersistableRemoteRef(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.startsWith('flow-asset:')) return true;
  return false;
}

function shouldDropString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^data:/i.test(trimmed)) return true;
  if (/^blob:/i.test(trimmed)) return true;
  const compact = trimmed.replace(/\s+/g, '');
  if (
    BASE64_IMAGE_MAGIC_PREFIXES.some((prefix) => compact.startsWith(prefix)) &&
    compact.length >= 32
  ) {
    return true;
  }
  return looksLikeBase64(compact);
}

/** 协作广播用 data patch：允许文字/状态/远程 URL，剔除 base64/blob/函数 */
export function sanitizeCollabDataPatch(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith('_')) continue;
    if (key === 'onRun' || key === 'onSend') continue;
    if (typeof value === 'function') continue;

    if (key === 'imageData' || key === 'thumbnail') {
      if (typeof value === 'string' && isPersistableRemoteRef(value)) {
        out[key] = value.trim();
      }
      continue;
    }

    if (typeof value === 'string') {
      if (shouldDropString(value)) continue;
      out[key] = value;
      continue;
    }

    if (
      value === null ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      try {
        const cloned = JSON.parse(JSON.stringify(value));
        out[key] = cloned;
      } catch {
        /* skip non-serializable */
      }
      continue;
    }

    if (typeof value === 'object') {
      try {
        const cloned = JSON.parse(JSON.stringify(value));
        out[key] = cloned;
      } catch {
        /* skip */
      }
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

export function buildCollabNodeUpsert(node: Node | Record<string, unknown>): Record<string, unknown> {
  const n = node as Node;
  const data = sanitizeCollabDataPatch((n.data ?? {}) as Record<string, unknown>);
  return {
    id: n.id,
    ...(n.type ? { type: n.type } : {}),
    ...(n.position ? { position: { ...n.position } } : {}),
    ...(data ? { data } : {}),
    ...(n.width != null ? { width: n.width } : {}),
    ...(n.height != null ? { height: n.height } : {}),
    ...(n.style ? { style: { ...n.style } } : {}),
  };
}

export function buildCollabNodeDataUpsert(
  nodeId: string,
  patch: Record<string, unknown>,
  position?: { x: number; y: number },
): Record<string, unknown> | null {
  const data = sanitizeCollabDataPatch(patch);
  if (!data && !position) return null;
  return {
    id: nodeId,
    ...(position ? { position } : {}),
    ...(data ? { data } : {}),
  };
}
