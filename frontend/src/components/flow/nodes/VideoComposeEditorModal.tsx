import React from "react";
import { createPortal } from "react-dom";

import { proxifyRemoteAssetUrl, resolvePublicAssetUrlFromKey } from "@/utils/assetProxy";
import { isAssetKeyRef, isLikelyBackendAllowedRemoteUrl, isRemoteUrl } from "@/utils/imageSource";
import { useLocaleText } from "@/utils/localeText";

import { ensureComposeSourceUrl } from "./videoCompose/ensureComposeSourceUrl";
import { reliableClipFetch } from "./videoCompose/reliableClipFetch";
import { useVideoCompose } from "./videoCompose/useVideoCompose";
import {
  VIDEO_COMPOSE_DEFAULT_TIMELINE_PX_PER_SECOND,
  VIDEO_COMPOSE_MIN_CLIP_US,
  type VideoComposeAudioTrack,
  type VideoComposeProgress,
  type VideoComposeSource,
} from "./videoCompose/types";

type Props = {
  isOpen: boolean;
  initialSources: VideoComposeSource[];
  initialAudio?: VideoComposeAudioTrack;
  onClose: () => void;
  onSaveComposed: (payload: {
    blob: Blob;
    sources: VideoComposeSource[];
    audioTrack?: VideoComposeAudioTrack;
    thumbnailUrl?: string;
  }) => Promise<void> | void;
};

type MP4ClipLike = {
  ready: Promise<unknown>;
  meta: {
    duration: number;
    width: number;
    height: number;
  };
  tick: (time: number) => Promise<{
    video?: VideoFrame;
    audio: Float32Array[];
    state: "success" | "done";
  }>;
  thumbnails: (
    imgWidth?: number,
    opts?: Partial<{ start: number; end: number; step: number }>
  ) => Promise<Array<{ ts: number; img: Blob }>>;
  split: (time: number) => Promise<[MP4ClipLike, MP4ClipLike]>;
  destroy: () => void;
};

type ClipThumb = {
  ts: number;
  url: string;
};

type EditableClip = {
  id: string;
  runtimeId: string;
  sourceId: string;
  sourceUrl: string;
  clip: MP4ClipLike | null;
  sourceOffsetUs: number;
  sourceDurationUs: number;
  clipDurationUs: number;
  trimStart: number;
  trimEnd: number;
  thumbs: ClipThumb[];
  sourceMeta: {
    title: string;
    thumbnailUrl?: string;
  };
};

type LoadedVideoMetadata = {
  durationUs: number;
  width: number;
  height: number;
};

type TimelineEntry = {
  clip: EditableClip;
  startUs: number;
  endUs: number;
};

type DragState =
  | {
      kind: "playhead";
      rectLeft: number;
      totalUs: number;
    }
  | {
      kind: "trim-start" | "trim-end";
      clipId: string;
      rectLeft: number;
      scalePxPerSecond: number;
      baseClips: EditableClip[];
    };

const FRAME_TILE_WIDTH_PX = 120;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const formatUs = (value: number) => {
  const totalMs = Math.max(0, Math.round(value / 1000));
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const ms = totalMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
    Math.floor(ms / 10)
  ).padStart(2, "0")}`;
};

const formatTimelineTick = (valueUs: number) => {
  const totalSeconds = Math.max(0, Math.floor(valueUs / 1e6));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const toPreviewableVideoUrl = (value?: string) => {
  if (!value) return undefined;
  if (isRemoteUrl(value) && isLikelyBackendAllowedRemoteUrl(value)) {
    return proxifyRemoteAssetUrl(value, { forceProxy: true });
  }
  if (isRemoteUrl(value)) return value;
  if (isAssetKeyRef(value)) {
    const key = value.replace(/^\/+/, "");
    return (
      resolvePublicAssetUrlFromKey(key) ??
      proxifyRemoteAssetUrl(`/api/assets/proxy?key=${encodeURIComponent(key)}`, {
        forceProxy: true,
      })
    );
  }
  return value;
};

const getVideoPreviewCandidates = (value?: string) => {
  const candidates: string[] = [];
  const add = (candidate?: string) => {
    const trimmed = typeof candidate === "string" ? candidate.trim() : "";
    if (!trimmed || candidates.includes(trimmed)) return;
    candidates.push(trimmed);
  };
  add(toPreviewableVideoUrl(value));
  if (!value || !isRemoteUrl(value) || !isLikelyBackendAllowedRemoteUrl(value)) {
    add(value);
  }
  return candidates;
};

const buildTimeline = (clips: EditableClip[]): TimelineEntry[] => {
  let cursor = 0;
  return clips.map((clip) => {
    const durationUs = clip.trimEnd - clip.trimStart;
    const entry = {
      clip,
      startUs: cursor,
      endUs: cursor + durationUs,
    };
    cursor += durationUs;
    return entry;
  });
};

const collectBoundaryUs = (entries: TimelineEntry[]) => {
  const values = new Set<number>([0]);
  entries.forEach((entry) => {
    values.add(Math.round(entry.startUs));
    values.add(Math.round(entry.endUs));
  });
  return Array.from(values).sort((a, b) => a - b);
};

const snapToBoundaryUs = (value: number, boundaries: number[], thresholdUs: number) => {
  let best = value;
  let bestDistance = thresholdUs;
  for (const boundary of boundaries) {
    const distance = Math.abs(boundary - value);
    if (distance <= bestDistance) {
      best = boundary;
      bestDistance = distance;
    }
  }
  return best;
};

const findEntryByTime = (entries: TimelineEntry[], currentUs: number) => {
  for (const entry of entries) {
    if (currentUs >= entry.startUs && currentUs < entry.endUs) return entry;
  }
  return entries[entries.length - 1] ?? null;
};

const showComposeToast = (type: "warning" | "error" | "success", message: string) => {
  window.dispatchEvent(
    new CustomEvent("toast", {
      detail: {
        type,
        message,
      },
    })
  );
};

const makeClipStateId = (sourceId: string, index: number) =>
  `${sourceId}-${index}-${Math.random().toString(36).slice(2, 8)}`;

const makeClipRuntimeId = () => `runtime-${Math.random().toString(36).slice(2, 10)}`;

const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  let timer: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer != null) {
      window.clearTimeout(timer);
    }
  }
};

const tryLoadVideoMetadata = (url: string, signal?: AbortSignal): Promise<LoadedVideoMetadata> =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      signal?.removeEventListener("abort", onAbort);
      try {
        video.pause();
      } catch {}
      video.removeAttribute("src");
      video.load();
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onAbort = () => finish(() => reject(new DOMException("Aborted", "AbortError")));

    video.preload = "metadata";
    video.muted = true;
    video.crossOrigin = "anonymous";
    (video as any).playsInline = true;
    video.onloadedmetadata = () => {
      const durationSeconds = Number(video.duration || 0);
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        finish(() => reject(new Error("无法读取视频时长")));
        return;
      }
      finish(() =>
        resolve({
          durationUs: Math.round(durationSeconds * 1e6),
          width: Number(video.videoWidth || 1280),
          height: Number(video.videoHeight || 720),
        })
      );
    };
    video.onerror = () => finish(() => reject(new Error("视频 metadata 加载失败")));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    video.src = url;
    video.load();
  });

const loadVideoMetadata = async (url: string, signal?: AbortSignal): Promise<LoadedVideoMetadata> => {
  const candidates = getVideoPreviewCandidates(url);
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return await tryLoadVideoMetadata(candidate, signal);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("视频 metadata 加载失败");
};

const getTimelineThumbCount = (durationUs: number) =>
  Math.max(4, Math.min(20, Math.ceil((durationUs / 1e6) * 2)));

const getThumbStepUs = (durationUs: number) => {
  const count = getTimelineThumbCount(durationUs);
  return Math.max(1, Math.floor(durationUs / count));
};

const cloneClipState = (
  clip: EditableClip,
  patch: Partial<
    Pick<
      EditableClip,
      "id" | "trimStart" | "trimEnd" | "thumbs" | "clip" | "runtimeId" | "sourceOffsetUs" | "clipDurationUs" | "sourceDurationUs"
    >
  >
): EditableClip => ({
  ...clip,
  ...patch,
});

const revokeThumbs = (thumbs: ClipThumb[]) => {
  thumbs.forEach((thumb) => {
    try {
      URL.revokeObjectURL(thumb.url);
    } catch {}
  });
};

const revokeThumbsFromSnapshots = (snapshots: EditableClip[][]) => {
  const seen = new Set<string>();
  snapshots.forEach((snapshot) => {
    snapshot.forEach((clip) => {
      clip.thumbs.forEach((thumb) => {
        if (!thumb.url || seen.has(thumb.url)) return;
        seen.add(thumb.url);
        try {
          URL.revokeObjectURL(thumb.url);
        } catch {}
      });
    });
  });
};

const createThumbsForClip = async (
  clip: MP4ClipLike,
  options: {
    trimStartUs: number;
    trimEndUs: number;
    sourceOffsetUs: number;
  }
): Promise<ClipThumb[]> => {
  const { trimStartUs, trimEndUs, sourceOffsetUs } = options;
  const effectiveDurationUs = Math.max(1, trimEndUs - trimStartUs);
  const start = Math.max(0, trimStartUs - sourceOffsetUs);
  const end = Math.max(start + 1, trimEndUs - sourceOffsetUs);
  const step = getThumbStepUs(effectiveDurationUs);

  console.log(
    `[createThumbsForClip] start=${start} end=${end} step=${step} duration=${effectiveDurationUs} meta.duration=${clip.meta.duration}`
  );

  try {
    const thumbs = await clip.thumbnails(FRAME_TILE_WIDTH_PX, { start, end, step });
    console.log(`[createThumbsForClip] clip.thumbnails returned ${thumbs.length} items`);
    if (thumbs.length > 0) {
      return thumbs.map((thumb) => ({
        ts: sourceOffsetUs + thumb.ts,
        url: URL.createObjectURL(thumb.img),
      }));
    }
  } catch (err) {
    console.warn(`[createThumbsForClip] clip.thumbnails failed:`, err);
  }

  // fallback: manually tick frames and convert to blob URLs
  const count = getTimelineThumbCount(effectiveDurationUs);
  const manualThumbs: ClipThumb[] = [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return manualThumbs;

  for (let i = 0; i < count; i += 1) {
    const t = start + (i * (end - start)) / Math.max(1, count - 1);
    try {
      const result = await clip.tick(Math.min(t, end));
      const frame = result.video;
      if (!frame) continue;
      const width = Number(clip.meta.width || 1280);
      const height = Number(clip.meta.height || 720);
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(frame, 0, 0, width, height);
      frame.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
      );
      if (blob) {
        manualThumbs.push({
          ts: sourceOffsetUs + Math.round(t),
          url: URL.createObjectURL(blob),
        });
      }
    } catch {
      // ignore single frame failure
    }
  }
  console.log(`[createThumbsForClip] fallback produced ${manualThumbs.length} thumbs`);
  return manualThumbs;
};

const updateClipThumbs = async (params: {
  clip: EditableClip;
}): Promise<EditableClip> => {
  if (!params.clip.clip) {
    return params.clip;
  }
  const thumbs = await createThumbsForClip(params.clip.clip, {
    trimStartUs: params.clip.trimStart,
    trimEndUs: params.clip.trimEnd,
    sourceOffsetUs: params.clip.sourceOffsetUs,
  });
  return cloneClipState(params.clip, { thumbs });
};

async function createEditableClipBase(params: {
  source: VideoComposeSource;
  index: number;
  signal?: AbortSignal;
}): Promise<EditableClip> {
  const { source, index, signal } = params;
  const previewUrl = toPreviewableVideoUrl(source.url) ?? source.url;
  const meta = await loadVideoMetadata(previewUrl, signal);
  const fullDurationUs = meta.durationUs;
  const trimStart = clamp(Math.round(source.trimStart || 0), 0, fullDurationUs);
  const trimEnd = clamp(
    Number.isFinite(source.trimEnd) && source.trimEnd > 0 ? Math.round(source.trimEnd) : fullDurationUs,
    trimStart + VIDEO_COMPOSE_MIN_CLIP_US,
    fullDurationUs
  );

  return {
    id: makeClipStateId(source.id, index),
    runtimeId: makeClipRuntimeId(),
    sourceId: source.id,
    sourceUrl: source.url,
    clip: null,
    sourceOffsetUs: 0,
    sourceDurationUs: fullDurationUs,
    clipDurationUs: fullDurationUs,
    trimStart,
    trimEnd,
    thumbs: [],
    sourceMeta: {
      title: source.title,
      thumbnailUrl: source.thumbnailUrl,
    },
  };
}

async function hydrateEditableClip(params: {
  MP4ClipCtor: new (stream: ReadableStream<Uint8Array>) => MP4ClipLike;
  clip: EditableClip;
  signal?: AbortSignal;
}): Promise<EditableClip> {
  const { MP4ClipCtor, clip, signal } = params;
  const fetched = await reliableClipFetch(clip.sourceUrl, signal);
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const mp4Clip = new MP4ClipCtor(fetched.stream);
  await withTimeout(mp4Clip.ready, 60_000, `片段「${clip.sourceMeta.title}」解析超时`);
  if (signal?.aborted) {
    mp4Clip.destroy();
    throw new DOMException("Aborted", "AbortError");
  }
  const thumbs = await createThumbsForClip(mp4Clip, {
    trimStartUs: clip.trimStart,
    trimEndUs: clip.trimEnd,
    sourceOffsetUs: clip.sourceOffsetUs,
  });
  return cloneClipState(clip, {
    clip: mp4Clip,
    sourceDurationUs: Math.round(Number(mp4Clip.meta.duration || clip.sourceDurationUs)),
    clipDurationUs: Math.round(Number(mp4Clip.meta.duration || clip.clipDurationUs)),
    thumbs,
  });
}

export default function VideoComposeEditorModal({
  isOpen,
  initialSources,
  initialAudio,
  onClose,
  onSaveComposed,
}: Props) {
  const { lt } = useLocaleText();
  const { composing, progress, error, start, cancel } = useVideoCompose();
  const [loading, setLoading] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<EditableClip[][]>([]);
  const [historyIndex, setHistoryIndex] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [audioTrack, setAudioTrack] = React.useState<VideoComposeAudioTrack | undefined>(initialAudio);
  const [pxPerSecond, setPxPerSecond] = React.useState(VIDEO_COMPOSE_DEFAULT_TIMELINE_PX_PER_SECOND);
  const [currentUs, setCurrentUs] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [dragPreviewClips, setDragPreviewClips] = React.useState<EditableClip[] | null>(null);
  const [clipCtor, setClipCtor] = React.useState<(new (stream: ReadableStream<Uint8Array>) => MP4ClipLike) | null>(null);

  const previewCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const playStateRef = React.useRef<{ startedAt: number; timelineStartedUs: number } | null>(null);
  const dragStateRef = React.useRef<DragState | null>(null);
  const dragPreviewRef = React.useRef<EditableClip[] | null>(null);
  const historyRef = React.useRef<EditableClip[][]>([]);
  const historyIndexRef = React.useRef(0);
  const timelineRef = React.useRef<HTMLDivElement | null>(null);
  const drawSeqRef = React.useRef(0);
  const runtimeRegistryRef = React.useRef<Map<string, EditableClip>>(new Map());

  const clips = dragPreviewClips ?? history[historyIndex] ?? [];
  const timelineEntries = React.useMemo(() => buildTimeline(clips), [clips]);
  const totalDurationUs = timelineEntries[timelineEntries.length - 1]?.endUs ?? 0;
  const selectedEntry = timelineEntries.find((entry) => entry.clip.id === selectedId) ?? null;
  const activePreviewEntry = React.useMemo(() => findEntryByTime(timelineEntries, currentUs), [currentUs, timelineEntries]);
  const timelineWidthPx = Math.max(560, (totalDurationUs / 1e6) * pxPerSecond + 20);
  const timelineTicks = React.useMemo(() => {
    if (totalDurationUs <= 0) return [];
    const ticks: Array<{ timeUs: number; leftPx: number; major: boolean; label?: string }> = [];
    for (let timeUs = 0; timeUs <= totalDurationUs + 1; timeUs += 500_000) {
      const major = timeUs % 1_000_000 === 0;
      ticks.push({
        timeUs,
        leftPx: (timeUs / 1e6) * pxPerSecond,
        major,
        label: major ? formatTimelineTick(timeUs) : undefined,
      });
    }
    return ticks;
  }, [pxPerSecond, totalDurationUs]);

  const destroyRegisteredClips = React.useCallback(() => {
    runtimeRegistryRef.current.forEach((clip) => {
      try {
        clip.clip?.destroy();
      } catch {}
    });
    runtimeRegistryRef.current.clear();
    // History snapshots may share the same thumbnail object URLs across undo/redo states.
    // Revoke them only when the whole editor session is torn down.
    revokeThumbsFromSnapshots(historyRef.current);
  }, []);

  const registerClipRuntime = React.useCallback((clip: EditableClip) => {
    runtimeRegistryRef.current.set(clip.runtimeId, clip);
  }, []);

  const replaceRuntimeClip = React.useCallback((clip: EditableClip) => {
    runtimeRegistryRef.current.set(clip.runtimeId, clip);
  }, []);

  const pushHistory = React.useCallback(
    (next: EditableClip[]) => {
      setHistory((prev) => {
        const nextIndex = historyIndexRef.current + 1;
        prev.slice(nextIndex).forEach((snapshot) => {
          snapshot.forEach((clip) => {
            if (!runtimeRegistryRef.current.has(clip.runtimeId)) {
              try {
                clip.clip?.destroy();
              } catch {}
            }
          });
        });
        return [...prev.slice(0, nextIndex), next];
      });
      setHistoryIndex((prev) => prev + 1);
      setDragPreviewClips(null);
    },
    []
  );

  React.useEffect(() => {
    dragPreviewRef.current = dragPreviewClips;
  }, [dragPreviewClips]);

  React.useEffect(() => {
    historyRef.current = history;
    historyIndexRef.current = historyIndex;
  }, [history, historyIndex]);

  React.useEffect(() => {
    setAudioTrack(initialAudio);
  }, [initialAudio]);

  React.useEffect(
    () => () => {
      destroyRegisteredClips();
    },
    [destroyRegisteredClips]
  );

  React.useEffect(() => {
    if (!isOpen) return undefined;
    setLoading(true);
    setLoadingMessage(lt("正在准备视频资源...", "Preparing video sources..."));
    setLoadError(null);
    setHistory([]);
    setHistoryIndex(0);
    setSelectedId(null);
    setCurrentUs(0);
    setIsPlaying(false);
    setDragPreviewClips(null);
    destroyRegisteredClips();

    const controller = new AbortController();
    void (async () => {
      try {
        const mod = await import("@webav/av-cliper");
        if (controller.signal.aborted) return;
        setClipCtor(() => mod.MP4Clip as new (stream: ReadableStream<Uint8Array>) => MP4ClipLike);

        const normalizedSources: VideoComposeSource[] = [];
        for (let index = 0; index < initialSources.length; index += 1) {
          setLoadingMessage(
            lt(
              `正在转存外部视频 ${index + 1}/${initialSources.length}`,
              `Transferring external video ${index + 1}/${initialSources.length}`
            )
          );
          const source = initialSources[index];
          const normalizedUrl = await ensureComposeSourceUrl(source.url, {
            kind: "video",
            signal: controller.signal,
          });
          normalizedSources.push({
            ...source,
            url: normalizedUrl,
          });
        }

        const loaded: EditableClip[] = [];
        for (let index = 0; index < normalizedSources.length; index += 1) {
          setLoadingMessage(
            lt(
              `正在准备片段 ${index + 1}/${normalizedSources.length}`,
              `Preparing clip ${index + 1}/${normalizedSources.length}`
            )
          );
          const clip = await createEditableClipBase({
            source: normalizedSources[index],
            index,
            signal: controller.signal,
          });
          registerClipRuntime(clip);

          setLoadingMessage(
            lt(
              `正在生成缩略图 ${index + 1}/${normalizedSources.length}`,
              `Generating thumbnails ${index + 1}/${normalizedSources.length}`
            )
          );
          const hydratedClip = await hydrateEditableClip({
            MP4ClipCtor: mod.MP4Clip as new (stream: ReadableStream<Uint8Array>) => MP4ClipLike,
            clip,
            signal: controller.signal,
          });
          replaceRuntimeClip(hydratedClip);
          loaded.push(hydratedClip);
        }

        if (controller.signal.aborted) return;
        setHistory([loaded]);
        setHistoryIndex(0);
        setSelectedId(loaded[0]?.id ?? null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : lt("加载视频失败", "Failed to load videos"));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMessage(null);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [destroyRegisteredClips, initialSources, isOpen, lt, registerClipRuntime, replaceRuntimeClip]);

  React.useEffect(() => {
    if (!isOpen || timelineEntries.length === 0) return;
    if (currentUs > totalDurationUs) {
      setCurrentUs(totalDurationUs);
    }
  }, [currentUs, isOpen, timelineEntries.length, totalDurationUs]);

  React.useEffect(() => {
    if (!isOpen || clips.length === 0) return undefined;
    console.log(`[hydrate effect] clips=${clips.length} clipCtor=${!!clipCtor}`);
    const controller = new AbortController();

    void (async () => {
      for (const clip of clips) {
        if (controller.signal.aborted) return;
        const expectedThumbCount = getTimelineThumbCount(clip.trimEnd - clip.trimStart);
        console.log(`[hydrate effect] clip.id=${clip.id} hasClip=${!!clip.clip} thumbs=${clip.thumbs.length} expected=${expectedThumbCount}`);
        if (clip.clip && clip.thumbs.length === expectedThumbCount && expectedThumbCount > 0) {
          continue;
        }
        try {
          const nextClip = clip.clip
            ? await updateClipThumbs({
                clip,
              })
            : await hydrateEditableClip({
                MP4ClipCtor: clipCtor as new (stream: ReadableStream<Uint8Array>) => MP4ClipLike,
                clip,
                signal: controller.signal,
              });
          console.log(`[hydrate effect] hydrated clip.id=${nextClip.id} thumbs=${nextClip.thumbs.length}`);
          if (controller.signal.aborted) {
            if (nextClip.clip && nextClip.clip !== clip.clip) {
              try {
                nextClip.clip.destroy();
              } catch {}
            }
            revokeThumbs(nextClip.thumbs);
            return;
          }
          replaceRuntimeClip(nextClip);
          setHistory((prevHistory) =>
            prevHistory.map((snapshot, snapshotIndex) => {
              if (snapshotIndex !== historyIndexRef.current) return snapshot;
              return snapshot.map((item) => {
                if (item.id !== nextClip.id) return item;
                if (item.clip && item.clip !== nextClip.clip) {
                  try {
                    item.clip.destroy();
                  } catch {}
                }
                return nextClip;
              });
            })
          );
        } catch (err) {
          console.error(`[hydrate effect] failed for clip.id=${clip.id}:`, err);
          if (controller.signal.aborted) return;
          setLoadError(err instanceof Error ? err.message : lt("视频加载失败", "Video loading failed"));
          return;
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [clipCtor, clips, isOpen, lt, pxPerSecond, replaceRuntimeClip]);

  React.useEffect(() => {
    if (!isOpen || timelineEntries.length === 0 || !isPlaying) return undefined;

    let raf = 0;
    let lastUs = currentUs;
    const loop = () => {
      const playState = playStateRef.current;
      if (!playState) return;
      const elapsedUs = (performance.now() - playState.startedAt) * 1000;
      const nextUs = playState.timelineStartedUs + elapsedUs;
      if (nextUs >= totalDurationUs) {
        setCurrentUs(totalDurationUs);
        setIsPlaying(false);
        playStateRef.current = null;
        previewAudioRef.current?.pause();
        return;
      }
      // throttle state updates to ~30fps to avoid React overload
      if (Math.abs(nextUs - lastUs) > 16_000) {
        lastUs = nextUs;
        setCurrentUs(nextUs);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, isPlaying, timelineEntries.length, totalDurationUs]);

  React.useEffect(() => {
    if (!isOpen) return;
    const audio = previewAudioRef.current;
    if (!audio || !audioTrack?.enabled || !audioTrack.url) {
      audio?.pause();
      return;
    }
    const previewUrl = toPreviewableVideoUrl(audioTrack.url) ?? audioTrack.url;
    if (audio.src !== previewUrl) {
      audio.src = previewUrl;
      audio.load();
    }
    audio.loop = audioTrack.loop;
    audio.volume = clamp(audioTrack.volume, 0, 1.5);
    if (!isPlaying) {
      audio.pause();
      return;
    }
    const seekSeconds =
      audio.duration && Number.isFinite(audio.duration) && audio.duration > 0
        ? audioTrack.loop
          ? (currentUs / 1e6) % audio.duration
          : Math.min(currentUs / 1e6, audio.duration)
        : currentUs / 1e6;
    if (Math.abs(audio.currentTime - seekSeconds) > 0.25) {
      audio.currentTime = seekSeconds;
    }
    if (audio.paused) void audio.play().catch(() => {});
  }, [audioTrack, currentUs, isOpen, isPlaying]);

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const canvas = previewCanvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let raf = 0;
    let pending = false;

    const draw = async () => {
      if (pending) return;
      pending = true;
      const seq = ++drawSeqRef.current;
      try {
        if (loading || clips.length === 0) {
          ctx.clearRect(0, 0, canvas.width || 1, canvas.height || 1);
          return;
        }

        const entry = findEntryByTime(timelineEntries, currentUs);
        if (!entry || !entry.clip.clip) return;
        const absoluteSourceUs = entry.clip.trimStart + (currentUs - entry.startUs);
        const localUs = clamp(
          absoluteSourceUs - entry.clip.sourceOffsetUs,
          0,
          entry.clip.clipDurationUs
        );

        const result = await entry.clip.clip.tick(localUs);
        const frame = result.video;
        if (drawSeqRef.current !== seq) {
          frame?.close();
          return;
        }

        const width = Number(entry.clip.clip.meta.width || 1280);
        const height = Number(entry.clip.clip.meta.height || 720);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        if (frame) {
          ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
          frame.close();
        }
      } finally {
        pending = false;
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };

    schedule();
    return () => {
      cancelAnimationFrame(raf);
      drawSeqRef.current += 1;
    };
  }, [clips, currentUs, isOpen, loading, timelineEntries]);

  React.useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      event.preventDefault();
      if (drag.kind === "playhead") {
        const rawUs = clamp(((event.clientX - drag.rectLeft) / pxPerSecond) * 1e6, 0, drag.totalUs);
        const boundaries = collectBoundaryUs(buildTimeline(historyRef.current[historyIndexRef.current] ?? []));
        const nextUs = snapToBoundaryUs(rawUs, boundaries, (10 / pxPerSecond) * 1e6);
        setCurrentUs(nextUs);
        return;
      }

      const deltaUs = ((event.clientX - drag.rectLeft) / drag.scalePxPerSecond) * 1e6;
      const nextClips = drag.baseClips.map((clip) => {
        if (clip.id !== drag.clipId) return clip;
        if (drag.kind === "trim-start") {
          const nextTrimStart = clamp(
            Math.round(deltaUs),
            clip.sourceOffsetUs,
            clip.trimEnd - VIDEO_COMPOSE_MIN_CLIP_US
          );
          return cloneClipState(clip, { trimStart: nextTrimStart });
        }
        const nextTrimEnd = clamp(
          Math.round(deltaUs),
          clip.trimStart + VIDEO_COMPOSE_MIN_CLIP_US,
          clip.sourceOffsetUs + clip.clipDurationUs
        );
        return cloneClipState(clip, { trimEnd: nextTrimEnd });
      });
      setDragPreviewClips(nextClips);
    };

    const onMouseUp = () => {
      const drag = dragStateRef.current;
      if (!drag) return;
      dragStateRef.current = null;
      if (drag.kind !== "playhead" && dragPreviewRef.current) {
        pushHistory(dragPreviewRef.current);
      } else {
        setDragPreviewClips(null);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [pushHistory, pxPerSecond]);

  const seekTo = React.useCallback(
    (nextUs: number) => {
      const clamped = clamp(nextUs, 0, totalDurationUs);
      setCurrentUs(clamped);
      playStateRef.current = isPlaying
        ? { startedAt: performance.now(), timelineStartedUs: clamped }
        : null;
    },
    [isPlaying, totalDurationUs]
  );

  const handleTogglePlay = React.useCallback((event?: React.MouseEvent | React.PointerEvent) => {
    event?.stopPropagation();
    event?.preventDefault();
    if (timelineEntries.length === 0) return;
    setIsPlaying((prev) => {
      if (prev) {
        playStateRef.current = null;
        previewAudioRef.current?.pause();
        return false;
      }
      playStateRef.current = {
        startedAt: performance.now(),
        timelineStartedUs: currentUs,
      };
      return true;
    });
  }, [currentUs, timelineEntries.length]);

  const applyTrimAtPlayhead = React.useCallback(
    (kind: "start" | "end", event?: React.MouseEvent | React.PointerEvent) => {
      event?.stopPropagation();
      event?.preventDefault();
      if (!selectedEntry) return;
      const absoluteSourceUs = selectedEntry.clip.trimStart + (currentUs - selectedEntry.startUs);
      const nextClips = clips.map((clip) => {
        if (clip.id !== selectedEntry.clip.id) return clip;
        if (kind === "start") {
          return cloneClipState(clip, {
            trimStart: clamp(
              Math.round(absoluteSourceUs),
              clip.sourceOffsetUs,
              clip.trimEnd - VIDEO_COMPOSE_MIN_CLIP_US
            ),
          });
        }
        return cloneClipState(clip, {
          trimEnd: clamp(
            Math.round(absoluteSourceUs),
            clip.trimStart + VIDEO_COMPOSE_MIN_CLIP_US,
            clip.sourceOffsetUs + clip.clipDurationUs
          ),
        });
      });
      pushHistory(nextClips);
    },
    [clips, currentUs, pushHistory, selectedEntry]
  );

  const handleDeleteClip = React.useCallback((event?: React.MouseEvent | React.PointerEvent) => {
    event?.stopPropagation();
    event?.preventDefault();

    const targetClipId =
      selectedEntry?.clip.id ??
      activePreviewEntry?.clip.id ??
      clips[0]?.id ??
      null;

    if (!targetClipId) {
      showComposeToast("warning", lt("当前没有可删除的片段", "No clip is available to delete"));
      return;
    }
    if (clips.length <= 1) {
      showComposeToast("warning", lt("至少保留 1 段视频", "At least one clip must remain"));
      return;
    }

    const deleteIndex = clips.findIndex((clip) => clip.id === targetClipId);
    const nextClips = clips.filter((clip) => clip.id !== targetClipId);
    if (nextClips.length === clips.length) {
      showComposeToast("warning", lt("未找到要删除的片段", "Failed to find the clip to delete"));
      return;
    }

    const fallbackIndex = deleteIndex < 0 ? 0 : Math.min(deleteIndex, nextClips.length - 1);
    const nextSelectedClip = nextClips[fallbackIndex] ?? nextClips[nextClips.length - 1] ?? null;

    pushHistory(nextClips);
    setSelectedId(nextSelectedClip?.id ?? null);
    const nextTimeline = buildTimeline(nextClips);
    const nextTotalDurationUs = nextTimeline[nextTimeline.length - 1]?.endUs ?? 0;
    setCurrentUs((prev) => clamp(prev, 0, nextTotalDurationUs));
  }, [activePreviewEntry, clips, lt, pushHistory, selectedEntry]);

  const handleSplit = React.useCallback(async () => {
    if (!selectedEntry || !clipCtor || !selectedEntry.clip.clip) return;

    const splitAbsUs = Math.round(selectedEntry.clip.trimStart + (currentUs - selectedEntry.startUs));
    if (
      splitAbsUs <= selectedEntry.clip.trimStart + VIDEO_COMPOSE_MIN_CLIP_US ||
      splitAbsUs >= selectedEntry.clip.trimEnd - VIDEO_COMPOSE_MIN_CLIP_US
    ) {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: {
            type: "warning",
            message: lt("分割点离边界太近，至少保留 0.5 秒", "Split point must leave at least 0.5s on both sides"),
          },
        })
      );
      return;
    }

    try {
      setLoadingMessage(lt("正在分割片段...", "Splitting clip..."));
      const localSplitUs = splitAbsUs - selectedEntry.clip.sourceOffsetUs;
      const [leftClip, rightClip] = await selectedEntry.clip.clip.split(localSplitUs);

      const leftStateBase: EditableClip = {
        ...selectedEntry.clip,
        id: makeClipStateId(selectedEntry.clip.sourceId, 0),
        runtimeId: makeClipRuntimeId(),
        clip: leftClip,
        sourceOffsetUs: selectedEntry.clip.sourceOffsetUs,
        clipDurationUs: localSplitUs,
        trimStart: selectedEntry.clip.trimStart,
        trimEnd: splitAbsUs,
        thumbs: [],
      };
      const rightStateBase: EditableClip = {
        ...selectedEntry.clip,
        id: makeClipStateId(selectedEntry.clip.sourceId, 1),
        runtimeId: makeClipRuntimeId(),
        clip: rightClip,
        sourceOffsetUs: splitAbsUs,
        clipDurationUs: Math.max(1, selectedEntry.clip.clipDurationUs - localSplitUs),
        trimStart: splitAbsUs,
        trimEnd: selectedEntry.clip.trimEnd,
        thumbs: [],
      };
      registerClipRuntime(leftStateBase);
      registerClipRuntime(rightStateBase);

      const nextClips: EditableClip[] = [];
      for (const clip of clips) {
        if (clip.id !== selectedEntry.clip.id) {
          nextClips.push(clip);
          continue;
        }
        nextClips.push(leftStateBase, rightStateBase);
      }
      pushHistory(nextClips);
      setSelectedId(rightStateBase.id);
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: {
            type: "error",
            message: err instanceof Error ? err.message : lt("分割失败", "Split failed"),
          },
        })
      );
    } finally {
      setLoadingMessage(null);
    }
  }, [clipCtor, clips, currentUs, lt, pxPerSecond, pushHistory, registerClipRuntime, selectedEntry]);

  const handleExport = React.useCallback(async () => {
    const exportSources = clips.map<VideoComposeSource>((clip) => ({
      id: clip.sourceId,
      url: clip.sourceUrl,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
      title: clip.sourceMeta.title,
      thumbnailUrl: clip.sourceMeta.thumbnailUrl,
    }));
    const blob = await start({
      sources: exportSources,
      audioTrack,
      width: clips[0]?.clip?.meta.width,
      height: clips[0]?.clip?.meta.height,
    });
    await onSaveComposed({
      blob,
      sources: exportSources,
      audioTrack,
      thumbnailUrl: exportSources[0]?.thumbnailUrl,
    });
    onClose();
  }, [audioTrack, clips, onClose, onSaveComposed, start]);

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        background: "rgba(2, 6, 23, 0.96)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          color: "#fff",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>{lt("视频合成", "Video Compose")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="nodrag nopan"
              onClick={() => {
                setIsPlaying(false);
                previewAudioRef.current?.pause();
                onClose();
              }}
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              background: "transparent",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            {lt("关闭", "Close")}
          </button>
            <button
              className="nodrag nopan"
              onClick={handleExport}
              disabled={loading || composing || clips.length < 2}
            style={{
              border: "none",
              background: clips.length >= 2 && !loading ? "#2563eb" : "#64748b",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 16px",
              cursor: clips.length >= 2 && !loading ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            {composing ? lt("合成中...", "Composing...") : lt("导出 MP4", "Export MP4")}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12, minHeight: 0, flex: 1 }}>
        <div
          style={{
            background: "#0f172a",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.06)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              position: "relative",
              flex: 1,
              borderRadius: 12,
              overflow: "hidden",
              background: "#020617",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 320,
            }}
          >
            {loading ? (
              <div style={{ color: "#cbd5e1", fontSize: 14 }}>
                {loadingMessage || lt("正在加载视频片段...", "Loading clips...")}
              </div>
            ) : loadError ? (
              <div style={{ color: "#fca5a5", fontSize: 14 }}>{loadError}</div>
            ) : clips.length < 2 ? (
              <div style={{ color: "#cbd5e1", fontSize: 14 }}>
                {lt("至少需要 2 段视频才能进入编辑", "At least 2 video clips are required")}
              </div>
            ) : (
              <canvas
                ref={previewCanvasRef}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  display: "block",
                }}
              />
            )}
            <audio ref={previewAudioRef} />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              className="nodrag nopan"
              onClick={handleTogglePlay}
              disabled={clips.length < 2}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
                background: "#1f2937",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              {isPlaying ? lt("暂停", "Pause") : lt("播放", "Play")}
            </button>
            <button
              className="nodrag nopan"
              onClick={() => applyTrimAtPlayhead("start")}
              disabled={!selectedEntry}
              style={{ borderRadius: 8, padding: "8px 12px", border: "1px solid #334155", background: "#111827", color: "#fff", cursor: "pointer" }}
            >
              {lt("设入点", "Set In")}
            </button>
            <button
              className="nodrag nopan"
              onClick={() => applyTrimAtPlayhead("end")}
              disabled={!selectedEntry}
              style={{ borderRadius: 8, padding: "8px 12px", border: "1px solid #334155", background: "#111827", color: "#fff", cursor: "pointer" }}
            >
              {lt("设出点", "Set Out")}
            </button>
            <button
              className="nodrag nopan"
              onClick={() => void handleSplit()}
              disabled={!selectedEntry || loading}
              style={{ borderRadius: 8, padding: "8px 12px", border: "1px solid #334155", background: "#111827", color: "#fff", cursor: "pointer" }}
            >
              {lt("按播放头分割", "Split At Playhead")}
            </button>
            <button
              className="nodrag nopan"
              onClick={handleDeleteClip}
              disabled={clips.length <= 1}
              style={{ borderRadius: 8, padding: "8px 12px", border: "1px solid #7f1d1d", background: "#450a0a", color: "#fff", cursor: "pointer" }}
            >
              {lt("删除片段", "Delete Clip")}
            </button>
            <button
              className="nodrag nopan"
              onClick={() => {
                if (historyIndex <= 0) return;
                setHistoryIndex((prev) => prev - 1);
                setDragPreviewClips(null);
              }}
              disabled={historyIndex <= 0}
              style={{ borderRadius: 8, padding: "8px 12px", border: "1px solid #334155", background: "#111827", color: "#fff", cursor: "pointer" }}
            >
              {lt("撤销", "Undo")}
            </button>
            <button
              className="nodrag nopan"
              onClick={() => {
                if (historyIndex >= history.length - 1) return;
                setHistoryIndex((prev) => prev + 1);
                setDragPreviewClips(null);
              }}
              disabled={historyIndex >= history.length - 1}
              style={{ borderRadius: 8, padding: "8px 12px", border: "1px solid #334155", background: "#111827", color: "#fff", cursor: "pointer" }}
            >
              {lt("重做", "Redo")}
            </button>
            <label className="nodrag nopan" style={{ display: "flex", alignItems: "center", gap: 8, color: "#cbd5e1", marginLeft: "auto" }}>
              {lt("缩放", "Zoom")}
              <input
                className="nodrag nopan"
                type="range"
                min={30}
                max={180}
                step={2}
                value={pxPerSecond}
                onChange={(e) => setPxPerSecond(Number(e.target.value))}
              />
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, color: "#cbd5e1", fontSize: 12, marginTop: 10 }}>
            <span>{lt("播放头", "Playhead")}: {formatUs(currentUs)}</span>
            <span>{lt("总时长", "Total")}: {formatUs(totalDurationUs)}</span>
          </div>

          <div
            ref={timelineRef}
            className="nodrag nopan"
            style={{
              position: "relative",
              marginTop: 10,
              overflowX: "auto",
              overflowY: "hidden",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)",
              background: "#0b1220",
              padding: "10px 8px 16px",
            }}
            onMouseDown={(event) => {
              const rect = timelineRef.current?.getBoundingClientRect();
              if (!rect) return;
              dragStateRef.current = {
                kind: "playhead",
                rectLeft: rect.left,
                totalUs: totalDurationUs,
              };
              seekTo(((event.clientX - rect.left) / pxPerSecond) * 1e6);
            }}
          >
            <div
              style={{
                position: "relative",
                width: `${timelineWidthPx}px`,
                height: 122,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: "0 0 auto 0",
                  height: 24,
                }}
              >
                {timelineTicks.map((tick) => (
                  <div
                    key={tick.timeUs}
                    style={{
                      position: "absolute",
                      left: tick.leftPx,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: tick.major ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)",
                    }}
                  >
                    {tick.label ? (
                      <span
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 4,
                          fontSize: 11,
                          color: "#94a3b8",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tick.label}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              {timelineEntries.map((entry, index) => {
                const widthPx = ((entry.endUs - entry.startUs) / 1e6) * pxPerSecond;
                const leftPx = (entry.startUs / 1e6) * pxPerSecond;
                const selected = entry.clip.id === selectedId;
                const clipDurationUs = entry.clip.trimEnd - entry.clip.trimStart;
                const visibleThumbs = entry.clip.thumbs;

                return (
                  <div
                    key={entry.clip.id}
                    className="nodrag nopan"
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      setSelectedId(entry.clip.id);
                    }}
                    style={{
                      position: "absolute",
                      left: leftPx,
                      top: 30,
                      width: Math.max(20, widthPx),
                      height: 76,
                      borderRadius: 10,
                      background: "#0f172a",
                      boxShadow: selected ? "0 0 0 2px rgba(255,255,255,0.75)" : "none",
                      color: "#fff",
                      cursor: "pointer",
                      userSelect: "none",
                      overflow: "hidden",
                      border: `1px solid ${
                        selected ? "rgba(96,165,250,0.95)" : index % 2 === 0 ? "rgba(14,165,233,0.55)" : "rgba(20,184,166,0.55)"
                      }`,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        opacity: 0.95,
                      }}
                    >
                      {visibleThumbs.length > 0 ? (
                        visibleThumbs.map((thumb, ti) => {
                          const tStart = Math.max(thumb.ts, entry.clip.trimStart);
                          const tEnd = visibleThumbs[ti + 1]?.ts ?? entry.clip.trimEnd;
                          const lPct = clipDurationUs > 0 ? ((tStart - entry.clip.trimStart) / clipDurationUs) * 100 : 0;
                          const wPct =
                            clipDurationUs > 0
                              ? ((Math.min(tEnd, entry.clip.trimEnd) - tStart) / clipDurationUs) * 100
                              : 0;
                          return (
                            <img
                              key={`${entry.clip.id}-thumb-${thumb.ts}`}
                              src={thumb.url}
                              alt=""
                              draggable={false}
                              style={{
                                position: "absolute",
                                left: `${lPct}%`,
                                width: `${wPct}%`,
                                height: "100%",
                                objectFit: "cover",
                                borderRight:
                                  ti < visibleThumbs.length - 1 ? "1px solid rgba(255,255,255,0.14)" : "none",
                                filter: selected ? "brightness(1.06)" : "brightness(0.92)",
                              }}
                            />
                          );
                        })
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            background:
                              index % 2 === 0
                                ? "linear-gradient(135deg, rgba(14,165,233,0.55), rgba(15,23,42,0.92))"
                                : "linear-gradient(135deg, rgba(20,184,166,0.55), rgba(15,23,42,0.92))",
                          }}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        inset: "auto 0 0 0",
                        padding: "4px 10px 6px",
                        background: "linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.82) 55%, rgba(2,6,23,0.95) 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        pointerEvents: "none",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontWeight: 600,
                        }}
                      >
                        {entry.clip.sourceMeta.title}
                      </span>
                      <span style={{ fontSize: 11, color: "#cbd5e1", flexShrink: 0 }}>
                        {formatUs(entry.clip.trimEnd - entry.clip.trimStart)}
                      </span>
                    </div>
                    <div
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        const rect = timelineRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        dragStateRef.current = {
                          kind: "trim-start",
                          clipId: entry.clip.id,
                          rectLeft: rect.left - (entry.startUs / 1e6) * pxPerSecond,
                          scalePxPerSecond: pxPerSecond,
                          baseClips: history[historyIndex] ?? [],
                        };
                      }}
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: 10,
                        height: "100%",
                        background: "rgba(255,255,255,0.88)",
                        borderRadius: "10px 0 0 10px",
                        cursor: "ew-resize",
                      }}
                    />
                    <div
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        const rect = timelineRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        dragStateRef.current = {
                          kind: "trim-end",
                          clipId: entry.clip.id,
                          rectLeft: rect.left - ((entry.startUs - entry.clip.trimStart) / 1e6) * pxPerSecond,
                          scalePxPerSecond: pxPerSecond,
                          baseClips: history[historyIndex] ?? [],
                        };
                      }}
                      style={{
                        position: "absolute",
                        right: 0,
                        top: 0,
                        width: 10,
                        height: "100%",
                        background: "rgba(255,255,255,0.88)",
                        borderRadius: "0 10px 10px 0",
                        cursor: "ew-resize",
                      }}
                    />
                  </div>
                );
              })}

              <div
                style={{
                  position: "absolute",
                  left: `${(currentUs / 1e6) * pxPerSecond}px`,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: "#f8fafc",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: -6,
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: "#f8fafc",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              background: "#111827",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 0,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>{lt("当前片段", "Selected Clip")}</div>
              {selectedEntry ? (
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  {selectedEntry.clip.sourceMeta.title} · {formatUs(selectedEntry.clip.trimEnd - selectedEntry.clip.trimStart)}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{lt("请选择片段", "Select a clip")}</div>
              )}
            </div>

            {selectedEntry ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  <div style={{ borderRadius: 8, background: "#020617", border: "1px solid #334155", padding: "8px 10px" }}>
                    <div style={{ fontSize: 11, color: "#64748b" }}>In</div>
                    <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 2 }}>{formatUs(selectedEntry.clip.trimStart)}</div>
                  </div>
                  <div style={{ borderRadius: 8, background: "#020617", border: "1px solid #334155", padding: "8px 10px" }}>
                    <div style={{ fontSize: 11, color: "#64748b" }}>Out</div>
                    <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 2 }}>{formatUs(selectedEntry.clip.trimEnd)}</div>
                  </div>
                  <div style={{ borderRadius: 8, background: "#020617", border: "1px solid #334155", padding: "8px 10px" }}>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{lt("时长", "Duration")}</div>
                    <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 2 }}>
                      {formatUs(selectedEntry.clip.trimEnd - selectedEntry.clip.trimStart)}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <label style={{ fontSize: 12, color: "#cbd5e1" }}>
                    trimStart (us)
                    <input
                      className="nodrag nopan"
                      type="number"
                      value={selectedEntry.clip.trimStart}
                      onChange={(e) => {
                        const next = clamp(
                          Number(e.target.value || 0),
                          selectedEntry.clip.sourceOffsetUs,
                          selectedEntry.clip.trimEnd - VIDEO_COMPOSE_MIN_CLIP_US
                        );
                        pushHistory(
                          clips.map((clip) =>
                            clip.id === selectedEntry.clip.id ? cloneClipState(clip, { trimStart: next }) : clip
                          )
                        );
                      }}
                      style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #334155", background: "#020617", color: "#fff" }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: "#cbd5e1" }}>
                    trimEnd (us)
                    <input
                      className="nodrag nopan"
                      type="number"
                      value={selectedEntry.clip.trimEnd}
                      onChange={(e) => {
                        const next = clamp(
                          Number(e.target.value || selectedEntry.clip.sourceOffsetUs + selectedEntry.clip.clipDurationUs),
                          selectedEntry.clip.trimStart + VIDEO_COMPOSE_MIN_CLIP_US,
                          selectedEntry.clip.sourceOffsetUs + selectedEntry.clip.clipDurationUs
                        );
                        pushHistory(
                          clips.map((clip) =>
                            clip.id === selectedEntry.clip.id ? cloneClipState(clip, { trimEnd: next }) : clip
                          )
                        );
                      }}
                      style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #334155", background: "#020617", color: "#fff" }}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ background: "#111827", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>{lt("背景音频", "Background Audio")}</div>
            {audioTrack ? (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: "#cbd5e1" }}>
                  <input
                    type="checkbox"
                    checked={audioTrack.enabled}
                    onChange={(e) => setAudioTrack((prev) => (prev ? { ...prev, enabled: e.target.checked } : prev))}
                  />
                  {lt("启用音频混入", "Enable audio mix")}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: "#cbd5e1" }}>
                  <span>{lt("音量", "Volume")}</span>
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={audioTrack.volume}
                    onChange={(e) =>
                      setAudioTrack((prev) => (prev ? { ...prev, volume: Number(e.target.value) } : prev))
                    }
                  />
                  <span>{audioTrack.volume.toFixed(2)}</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: "#cbd5e1" }}>
                  <input
                    type="checkbox"
                    checked={audioTrack.loop}
                    onChange={(e) => setAudioTrack((prev) => (prev ? { ...prev, loop: e.target.checked } : prev))}
                  />
                  {lt("循环铺满全片", "Loop through full video")}
                </label>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                  {audioTrack.title || lt("来自上游音频节点", "From upstream audio node")}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                {lt("未连接音频节点，将仅使用视频自身音轨", "No audio node connected, only source video audio will be used")}
              </div>
            )}
          </div>

          <div style={{ background: "#111827", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>{lt("合成状态", "Compose Status")}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
              {progress
                ? `${progress.phase} · ${Math.round(progress.progress)}%${progress.message ? ` · ${progress.message}` : ""}`
                : loadingMessage || lt("待开始", "Idle")}
            </div>
            {(error || loadError) && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#fecaca", background: "#450a0a", borderRadius: 8, padding: "8px 10px" }}>
                {error || loadError}
              </div>
            )}
            {composing && (
              <button
                onClick={cancel}
                style={{
                  marginTop: 10,
                  borderRadius: 8,
                  padding: "8px 12px",
                  border: "1px solid #fecaca",
                  background: "#fff1f2",
                  color: "#b91c1c",
                  cursor: "pointer",
                }}
              >
                {lt("取消合成", "Cancel Compose")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
