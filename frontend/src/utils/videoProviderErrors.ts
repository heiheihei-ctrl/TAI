const KLING_VIDEO_REF_AUDIO_CONFLICT_PATTERN =
  /audiogeneration\s+enabled\s+is\s+not\s+supported\s+when\s+video\s+reference\s+is\s+provided/i;

export const KLING_VIDEO_REF_AUDIO_CONFLICT_MESSAGE_ZH =
  "Kling 3.0-Omni 在「视频参考」模式下不支持开启 AI 音频生成。请将节点上的「音频」切换为关闭后重试；如需保留参考视频原声，请使用「保留原视频声音」。";

export const KLING_VIDEO_REF_AUDIO_CONFLICT_MESSAGE_EN =
  'Kling 3.0-Omni does not support AI audio generation when a video reference is provided. Turn off "Audio" on the node and retry; use "Keep original sound" to preserve the reference video audio.';

export const isKlingVideoRefAudioConflictError = (message: string): boolean =>
  KLING_VIDEO_REF_AUDIO_CONFLICT_PATTERN.test(message);

const mapSeedanceVideoProviderError = (
  message: string,
  locale: "zh" | "en"
): string | null => {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  if (!normalized || lower === "internal server error") {
    return locale === "en"
      ? "Seedance request failed. Retry later, or check whether your reference media is publicly accessible."
      : "Seedance 请求失败，请稍后重试；如果持续失败，请检查参考图、参考视频是否为可公网访问的直链。";
  }

  if (
    lower.includes("seedance") ||
    lower.includes("真人人脸") ||
    lower.includes("虚拟人像") ||
    lower.includes("reference_video") ||
    lower.includes("generate_audio") ||
    lower.includes("asset://")
  ) {
    if (
      lower.includes("真人人脸") ||
      lower.includes("真实人脸") ||
      lower.includes("real human face") ||
      lower.includes("虚拟人像")
    ) {
      return locale === "en"
        ? "Seedance 2.0 does not support direct reference images or videos containing real human faces. Use a virtual-human asset or a recent Seedance 2.0 output from the same account for further editing."
        : "Seedance 2.0 不支持直接使用含真人脸的参考图或参考视频。请改用虚拟人像 asset，或改用同账号下最近生成的 Seedance 2.0 视频做二创素材。";
    }
    if (
      lower.includes("failed to get the contents of the file") ||
      lower.includes("http_request_failed") ||
      lower.includes("参考素材")
    ) {
      return locale === "en"
        ? "Seedance could not fetch the reference media. Make sure the image/video/audio URLs are publicly accessible direct links."
        : "Seedance 无法读取参考素材。请确认参考图、参考视频、音频都是可公网访问的直链，且文件仍然有效。";
    }
    if (lower.includes("resolution") && lower.includes("not valid")) {
      return locale === "en"
        ? "The current Seedance mode does not accept this resolution setting. Retry with the default supported resolution."
        : "当前 Seedance 模式不支持这个分辨率参数。请改为默认支持的分辨率后重试。";
    }
    if (lower.includes("generate_audio") && lower.includes("not supported")) {
      return locale === "en"
        ? "The current Seedance mode does not support generated audio. Turn audio generation off and retry."
        : "当前 Seedance 模式不支持开启音频生成。请关闭“音频开启”后重试。";
    }
    if (lower.includes("moderation") || lower.includes("审核")) {
      return locale === "en"
        ? "Seedance moderation rejected this request. Adjust the prompt or replace the reference media."
        : "Seedance 审核未通过。请调整提示词或更换参考素材，避免涉及真人脸、敏感人物、版权受限内容或其他平台限制内容。";
    }
    if (lower.includes("asset://") || (lower.includes("asset") && lower.includes("invalid"))) {
      return locale === "en"
        ? "The referenced Seedance asset is invalid, inactive, or inaccessible for this account."
        : "Seedance 引用的虚拟人像或素材 asset 还未就绪、已失效，或当前账号无权限访问。请重新选择可用素材后重试。";
    }
    return normalized;
  }

  return null;
};
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

  const seedanceMapped = mapSeedanceVideoProviderError(trimmed, locale);
  if (seedanceMapped) {
    return seedanceMapped;
  }
  return trimmed;
};
