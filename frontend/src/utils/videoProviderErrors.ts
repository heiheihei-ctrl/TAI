const KLING_VIDEO_REF_AUDIO_CONFLICT_PATTERN =
  /audiogeneration\s+enabled\s+is\s+not\s+supported\s+when\s+video\s+reference\s+is\s+provided/i;

export const KLING_VIDEO_REF_AUDIO_CONFLICT_MESSAGE_ZH =
  "Kling 3.0-Omni 在「视频参考」模式下不支持开启 AI 音频生成。请将节点上的「音频」切换为关闭后重试；如需保留参考视频原声，请使用「保留原视频声音」。";

export const KLING_VIDEO_REF_AUDIO_CONFLICT_MESSAGE_EN =
  'Kling 3.0-Omni does not support AI audio generation when a video reference is provided. Turn off "Audio" on the node and retry; use "Keep original sound" to preserve the reference video audio.';

export const isKlingVideoRefAudioConflictError = (message: string): boolean =>
  KLING_VIDEO_REF_AUDIO_CONFLICT_PATTERN.test(message);

export const formatVideoProviderError = (
  raw: unknown,
  options?: { locale?: "zh" | "en" }
): string => {
  const locale = options?.locale === "en" ? "en" : "zh";
  const message =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
      ? raw
      : typeof (raw as { message?: unknown })?.message === "string"
      ? String((raw as { message: string }).message)
      : "";

  const trimmed = message.trim();
  if (!trimmed) {
    return locale === "en" ? "Video generation failed" : "视频生成失败";
  }

  if (isKlingVideoRefAudioConflictError(trimmed)) {
    return locale === "en"
      ? KLING_VIDEO_REF_AUDIO_CONFLICT_MESSAGE_EN
      : KLING_VIDEO_REF_AUDIO_CONFLICT_MESSAGE_ZH;
  }

  return trimmed;
};
