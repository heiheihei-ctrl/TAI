import type { ManualAIMode } from "@/stores/aiChatStore";
import type { SupportedAIProvider } from "@/types/ai";
import { SHOW_FOREIGN_NODES } from "@/config/featureFlags";

export type ChatModelKey =
  | "nano-banana-pro"
  | "nano-banana-ultra"
  | "gpt-image-2"
  | "seedream-5-pro"
  | "seedance"
  | "nano-banana-fast"
  | "gemini-pro"
  | "midjourney";

export type ChatModelMediaType = "image" | "video";

export type ChatModelOption = {
  key: ChatModelKey;
  label: string;
  labelEn: string;
  tab: "common" | "other";
  mediaType: ChatModelMediaType;
  isNew?: boolean;
  provider: SupportedAIProvider;
  manualMode: ManualAIMode;
  /** gpt-image-2 专用：走 nano2 + 指定 model */
  imageModel?: string;
};

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    key: "nano-banana-pro",
    label: "Nano banana Pro",
    labelEn: "Nano banana Pro",
    tab: "common",
    mediaType: "image",
    provider: "banana",
    manualMode: "generate",
  },
  {
    key: "nano-banana-ultra",
    label: "Nano banana Ultra",
    labelEn: "Nano banana Ultra",
    tab: "common",
    mediaType: "image",
    provider: "banana-3.1",
    manualMode: "generate",
  },
  {
    key: "gpt-image-2",
    label: "GPT-image-2",
    labelEn: "GPT-image-2",
    tab: "common",
    mediaType: "image",
    provider: "nano2",
    manualMode: "generate",
    imageModel: "gpt-image-2-official",
  },
  {
    key: "seedream-5-pro",
    label: "Seedream 5.0Pro",
    labelEn: "Seedream 5.0Pro",
    tab: "common",
    mediaType: "image",
    isNew: true,
    provider: "seedream5Pro",
    manualMode: "generate",
  },
  {
    key: "seedance",
    label: "Seedance",
    labelEn: "Seedance",
    tab: "common",
    mediaType: "video",
    isNew: true,
    provider: "banana",
    manualMode: "video",
  },
  {
    key: "nano-banana-fast",
    label: "Nano banana Fast",
    labelEn: "Nano banana Fast",
    tab: "other",
    mediaType: "image",
    provider: "banana-2.5",
    manualMode: "generate",
  },
  {
    key: "gemini-pro",
    label: "Gemini Pro",
    labelEn: "Gemini Pro",
    tab: "other",
    mediaType: "image",
    provider: "gemini-pro",
    manualMode: "generate",
  },
  {
    key: "midjourney",
    label: "Midjourney",
    labelEn: "Midjourney",
    tab: "other",
    mediaType: "image",
    provider: "midjourney",
    manualMode: "generate",
  },
];

export function getVisibleChatModelOptions(): ChatModelOption[] {
  return CHAT_MODEL_OPTIONS.filter((opt) => {
    if (opt.tab === "other" && !SHOW_FOREIGN_NODES) {
      return opt.key === "nano-banana-fast";
    }
    if (
      !SHOW_FOREIGN_NODES &&
      (opt.key === "gpt-image-2" || opt.key === "gemini-pro" || opt.key === "midjourney")
    ) {
      return false;
    }
    return true;
  });
}

export function getChatModelOption(key: ChatModelKey): ChatModelOption | undefined {
  return CHAT_MODEL_OPTIONS.find((opt) => opt.key === key);
}

export function resolveChatModelKeyFromState(input: {
  aiProvider: SupportedAIProvider;
  manualAIMode: ManualAIMode;
  chatModelKey?: ChatModelKey | null;
}): ChatModelKey {
  if (input.chatModelKey) {
    const found = getChatModelOption(input.chatModelKey);
    if (found) return input.chatModelKey;
  }
  if (input.manualAIMode === "video") return "seedance";
  if (input.aiProvider === "seedream5Pro") return "seedream-5-pro";
  if (input.aiProvider === "nano2") return "gpt-image-2";
  if (input.aiProvider === "banana-3.1") return "nano-banana-ultra";
  if (input.aiProvider === "banana") return "nano-banana-pro";
  if (input.aiProvider === "banana-2.5") return "nano-banana-fast";
  if (input.aiProvider === "gemini-pro") return "gemini-pro";
  if (input.aiProvider === "midjourney") return "midjourney";
  return "nano-banana-pro";
}

export function applyChatModelSelection(option: ChatModelOption): {
  provider: SupportedAIProvider;
  manualMode: ManualAIMode;
  chatModelKey: ChatModelKey;
} {
  return {
    provider: option.provider,
    manualMode: option.manualMode,
    chatModelKey: option.key,
  };
}
