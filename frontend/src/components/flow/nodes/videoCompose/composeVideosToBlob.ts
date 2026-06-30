import {
  VIDEO_COMPOSE_DEFAULT_FPS,
  VIDEO_COMPOSE_MIN_CLIP_US,
  type VideoComposeAudioTrack,
  type VideoComposeProgress,
  type VideoComposeSource,
} from "./types";
import { fetchClip } from "./fetchClip";

type ComposeVideosToBlobOptions = {
  sources: VideoComposeSource[];
  audioTrack?: VideoComposeAudioTrack;
  width?: number;
  height?: number;
  fps?: number;
  signal?: AbortSignal;
  onProgress?: (progress: VideoComposeProgress) => void;
};

type PreparedVideoClip = {
  durationUs: number;
  width: number;
  height: number;
  clip: any;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const checkAbort = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
};

const normalizeOutputProgress = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 1) return value * 100;
  return value;
};

const streamToBlob = async (
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): Promise<Blob> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      checkAbort(signal);
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type: "video/mp4" });
};

const prepareVideoClip = async (
  source: VideoComposeSource,
  MP4Clip: any,
  signal?: AbortSignal
): Promise<PreparedVideoClip> => {
  const fetched = await fetchClip(source.url, { kind: "video", signal });
  checkAbort(signal);
  const originalClip = new MP4Clip(fetched.stream);
  const originalMeta = await originalClip.ready;
  checkAbort(signal);

  const fullDurationUs = Number(originalMeta.duration || 0);
  const trimStart = clamp(Math.round(source.trimStart || 0), 0, fullDurationUs);
  const rawTrimEnd =
    Number.isFinite(source.trimEnd) && source.trimEnd > 0 ? Math.round(source.trimEnd) : fullDurationUs;
  const trimEnd = clamp(rawTrimEnd, trimStart + VIDEO_COMPOSE_MIN_CLIP_US, fullDurationUs);
  const keptDurationUs = trimEnd - trimStart;
  if (keptDurationUs < VIDEO_COMPOSE_MIN_CLIP_US) {
    originalClip.destroy();
    throw new Error(`片段「${source.title}」裁剪后少于 0.5 秒，无法合成`);
  }

  let workingClip = originalClip;
  if (trimStart > 0) {
    const [head, tail] = await workingClip.split(trimStart);
    head.destroy();
    workingClip = tail;
  }
  if (keptDurationUs < Number(workingClip.meta.duration || keptDurationUs)) {
    const [body, tail] = await workingClip.split(keptDurationUs);
    if (workingClip !== originalClip) workingClip.destroy();
    tail.destroy();
    workingClip = body;
  }
  if (workingClip !== originalClip) {
    originalClip.destroy();
  }

  return {
    clip: workingClip,
    durationUs: Math.round(workingClip.meta.duration || keptDurationUs),
    width: Number(originalMeta.width || workingClip.meta.width || 1920),
    height: Number(originalMeta.height || workingClip.meta.height || 1080),
  };
};

export async function composeVideosToBlob(
  options: ComposeVideosToBlobOptions
): Promise<Blob> {
  const { sources, audioTrack, width, height, fps, signal, onProgress } = options;
  if (!Array.isArray(sources) || sources.length < 2) {
    throw new Error("至少需要 2 段视频才能合成");
  }

  const { AudioClip, Combinator, MP4Clip, OffscreenSprite } = await import("@webav/av-cliper");
  const supported = await Combinator.isSupported({
    width: width ?? 1280,
    height: height ?? 720,
  });
  if (!supported) {
    throw new Error("当前浏览器环境不支持 WebCodecs / WebAV 本地视频合成");
  }

  const preparedClips: Array<{ destroy: () => void }> = [];
  let combinator: any = null;
  let audioClip: any = null;
  const abortHandler = () => {
    try {
      combinator?.destroy();
    } catch {}
    try {
      audioClip?.destroy();
    } catch {}
    preparedClips.forEach((item) => {
      try {
        item.destroy();
      } catch {}
    });
  };
  signal?.addEventListener("abort", abortHandler, { once: true });

  try {
    const videoClips: PreparedVideoClip[] = [];
    for (let index = 0; index < sources.length; index += 1) {
      onProgress?.({
        phase: "prepare",
        progress: ((index + 1) / (sources.length + (audioTrack?.enabled ? 1 : 0))) * 100,
        message: `准备片段 ${index + 1}/${sources.length}`,
      });
      const prepared = await prepareVideoClip(sources[index], MP4Clip, signal);
      preparedClips.push(prepared.clip);
      videoClips.push(prepared);
    }

    const outputWidth = width ?? videoClips[0].width;
    const outputHeight = height ?? videoClips[0].height;
    combinator = new Combinator({
      width: outputWidth,
      height: outputHeight,
      fps: fps ?? VIDEO_COMPOSE_DEFAULT_FPS,
      bitrate: 8_000_000,
    });
    combinator.on("OutputProgress", (value: number) => {
      onProgress?.({
        phase: "output",
        progress: normalizeOutputProgress(value),
        message: "正在编码 MP4",
      });
    });

    let timelineOffsetUs = 0;
    for (const prepared of videoClips) {
      checkAbort(signal);
      const sprite = new OffscreenSprite(prepared.clip);
      sprite.rect.x = 0;
      sprite.rect.y = 0;
      sprite.rect.w = outputWidth;
      sprite.rect.h = outputHeight;
      sprite.time = {
        offset: timelineOffsetUs,
        duration: prepared.durationUs,
        playbackRate: 1,
      };
      await combinator.addSprite(sprite);
      timelineOffsetUs += prepared.durationUs;
    }

    if (audioTrack?.enabled && audioTrack.url) {
      onProgress?.({
        phase: "prepare",
        progress: 100,
        message: "准备背景音频",
      });
      const fetchedAudio = await fetchClip(audioTrack.url, { kind: "audio", signal });
      audioClip = new AudioClip(fetchedAudio.stream, {
        loop: audioTrack.loop,
        volume: clamp(audioTrack.volume, 0, 1.5),
      });
      await audioClip.ready;
      const audioSprite = new OffscreenSprite(audioClip);
      audioSprite.time = {
        offset: 0,
        duration: timelineOffsetUs,
        playbackRate: 1,
      };
      await combinator.addSprite(audioSprite);
    }

    const outputStream = combinator.output({ maxTime: timelineOffsetUs });
    const blob = await streamToBlob(outputStream, signal);
    if (blob.type && blob.type !== "video/mp4") {
      return new Blob([blob], { type: "video/mp4" });
    }
    return blob;
  } finally {
    signal?.removeEventListener("abort", abortHandler);
    try {
      combinator?.destroy();
    } catch {}
    try {
      audioClip?.destroy();
    } catch {}
    preparedClips.forEach((item) => {
      try {
        item.destroy();
      } catch {}
    });
  }
}
