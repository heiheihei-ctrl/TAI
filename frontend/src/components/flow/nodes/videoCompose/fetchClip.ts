import { getApiBaseUrl, proxifyRemoteAssetUrl, resolvePublicAssetUrlFromKey } from "@/utils/assetProxy";
import { isAssetKeyRef, isLikelyBackendAllowedRemoteUrl, isRemoteUrl } from "@/utils/imageSource";

import { ensureComposeSourceUrl } from "./ensureComposeSourceUrl";

type FetchClipKind = "video" | "audio";

type FetchClipOptions = {
  kind: FetchClipKind;
  signal?: AbortSignal;
  retries?: number;
};

type FetchClipResult = {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  finalUrl: string;
};

const DEFAULT_RETRIES = 3;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const HTML_PREFIX_RE = /^\s*(?:<!doctype\s+html|<html|<body|<head)/i;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

const toCandidates = (inputUrl: string): string[] => {
  const trimmed = inputUrl.trim();
  if (!trimmed) return [];

  if (isAssetKeyRef(trimmed)) {
    const key = trimmed.replace(/^\/+/, "");
    const proxied = `${getApiBaseUrl()}/api/assets/proxy?key=${encodeURIComponent(key)}`;
    const direct = resolvePublicAssetUrlFromKey(key);
    return direct ? [proxied, direct] : [proxied];
  }

  if (trimmed.startsWith("/api/assets/proxy") || trimmed.startsWith("/assets/proxy")) {
    const absoluteProxy = `${getApiBaseUrl()}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
    return [absoluteProxy];
  }

  if (isRemoteUrl(trimmed)) {
    const direct = trimmed as `http://${string}` | `https://${string}`;
    const candidates: string[] = [];
    if (isLikelyBackendAllowedRemoteUrl(trimmed)) {
      const proxied = proxifyRemoteAssetUrl(direct, { forceProxy: true });
      if (proxied && proxied !== direct) return [proxied];
    }
    candidates.push(direct);
    return candidates;
  }

  return [trimmed];
};

const looksLikeHtml = async (
  response: Response
): Promise<{ isHtml: boolean; stream?: ReadableStream<Uint8Array> }> => {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    return { isHtml: true };
  }
  // For video/audio/binary streams, trust the content-type and avoid teeing large bodies.
  if (
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType.startsWith("application/octet-stream") ||
    contentType === "binary/octet-stream"
  ) {
    return { isHtml: false, stream: response.body ?? undefined };
  }

  if (!response.body) {
    const blob = await response.blob();
    const header = await blob.slice(0, 128).text().catch(() => "");
    if (HTML_PREFIX_RE.test(header)) {
      return { isHtml: true };
    }
    return { isHtml: false, stream: blob.stream() as ReadableStream<Uint8Array> };
  }

  const [head, pass] = response.body.tee();
  const reader = head.getReader();
  try {
    const { value } = await reader.read();
    const text = value ? new TextDecoder().decode(value.slice(0, 128)) : "";
    if (HTML_PREFIX_RE.test(text)) {
      await pass.cancel().catch(() => {});
      return { isHtml: true };
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { isHtml: false, stream: pass };
};

export async function fetchClip(
  inputUrl: string,
  options: FetchClipOptions
): Promise<FetchClipResult> {
  console.log(`[fetchClip] input=${inputUrl.slice(0, 80)}...`);
  const normalizedUrl = await ensureComposeSourceUrl(inputUrl, {
    kind: options.kind,
    signal: options.signal,
  });
  console.log(`[fetchClip] normalized=${normalizedUrl.slice(0, 80)}...`);
  const candidates = toCandidates(normalizedUrl);
  if (candidates.length === 0) {
    throw new Error("缺少可用的视频/音频地址");
  }

  const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
  let lastError: unknown = null;

  for (const candidate of candidates) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      try {
        console.log(`[fetchClip] fetching candidate=${candidate.slice(0, 80)}... attempt=${attempt}`);
        const response = await fetch(candidate, {
          method: "GET",
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          signal: options.signal,
        });
        console.log(`[fetchClip] response status=${response.status} content-type=${response.headers.get("content-type")}`);

        if (!response.ok) {
          if (!RETRYABLE_STATUS.has(response.status) || attempt >= retries) {
            throw new Error(
              `${options.kind === "video" ? "视频" : "音频"}拉取失败: ${response.status} ${response.statusText}`
            );
          }
          await sleep(350 * 2 ** attempt);
          continue;
        }

        const inspected = await looksLikeHtml(response);
        console.log(`[fetchClip] inspected isHtml=${inspected.isHtml} hasStream=${!!inspected.stream}`);
        if (inspected.isHtml || !inspected.stream) {
          throw new Error(
            `${options.kind === "video" ? "视频" : "音频"}地址返回了 HTML 页面，已判定为无效资源`
          );
        }

        return {
          stream: inspected.stream,
          contentType: response.headers.get("content-type") || "",
          finalUrl: candidate,
        };
      } catch (error) {
        console.error(`[fetchClip] error:`, error);
        lastError = error;
        if (options.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        if (attempt >= retries) break;
        await sleep(350 * 2 ** attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("媒体资源拉取失败");
}
