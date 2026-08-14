/**
 * 英文版（国际版）下面板节点的可见性规则
 *
 * 国际版下节点面板仅保留：
 *  - Seedream 系列（doubao-seedream-5-0 / 5-0-pro）
 *  - seedance 系列（doubao-seedance / doubao-video 通道）
 *  - 免费节点（creditsPerCall === 0 且没有后端计费的 serviceType / priceYuan）
 *
 * 其它付费节点在国内版保持原样可见，国际版下隐藏。
 */
import type { NodeConfig } from "@/services/nodeConfigService";

const SEEDREAM_NODE_KEYS = new Set(["seedream5", "seedream5Pro"]);
const SEEDANCE_NODE_KEYS = new Set(["doubaoVideo", "seedance20Video"]);

const SEEDREAM_SERVICE_TYPES = new Set([
  "doubao-seedream-5-0-260128",
  "doubao-seedream-5-0-pro-260628",
]);

const SEEDANCE_SERVICE_TYPES = new Set(["doubao-video"]);

function readMetadataField(
  config: Partial<NodeConfig>,
  field: string
): unknown {
  const metadata = (config.metadata ?? {}) as Record<string, unknown>;
  if (metadata[field] != null) return metadata[field];
  const nested =
    metadata.nodeConfig && typeof metadata.nodeConfig === "object"
      ? (metadata.nodeConfig as Record<string, unknown>)
      : undefined;
  return nested?.[field];
}

function haystack(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function containsKeyword(value: unknown, keywords: readonly string[]): boolean {
  const hay = haystack(value);
  if (!hay) return false;
  return keywords.some((kw) => hay.includes(kw.toLowerCase()));
}

/** 当前语言是否为英文（国际版） */
export function isInternationalLanguage(language?: string | null): boolean {
  const value = String(language ?? "").toLowerCase().trim();
  return value.startsWith("en");
}

/** 是否为 Seedream 系列节点 */
export function isSeedreamPaletteConfig(
  config?: Partial<NodeConfig> | null
): boolean {
  if (!config) return false;
  if (config.nodeKey && SEEDREAM_NODE_KEYS.has(config.nodeKey)) return true;
  if (config.serviceType && SEEDREAM_SERVICE_TYPES.has(config.serviceType)) {
    return true;
  }
  if (containsKeyword(readMetadataField(config, "model"), ["seedream"])) {
    return true;
  }
  if (
    containsKeyword(readMetadataField(config, "flowNodeType"), ["seedream"])
  ) {
    return true;
  }
  if (containsKeyword(readMetadataField(config, "provider"), ["seedream"])) {
    return true;
  }
  if (
    containsKeyword(readMetadataField(config, "nodeKey"), ["seedream"])
  ) {
    return true;
  }
  return false;
}

/** 是否为 seedance 系列节点 */
export function isSeedancePaletteConfig(
  config?: Partial<NodeConfig> | null
): boolean {
  if (!config) return false;
  if (config.nodeKey && SEEDANCE_NODE_KEYS.has(config.nodeKey)) return true;
  if (config.serviceType && SEEDANCE_SERVICE_TYPES.has(config.serviceType)) {
    return true;
  }
  if (containsKeyword(readMetadataField(config, "model"), ["seedance"])) {
    return true;
  }
  if (
    containsKeyword(readMetadataField(config, "flowNodeType"), [
      "doubaoVideo",
      "seedance",
    ])
  ) {
    return true;
  }
  if (
    containsKeyword(readMetadataField(config, "provider"), [
      "doubao-video",
      "seedance",
    ])
  ) {
    return true;
  }
  return false;
}

/** 是否为免费节点（creditsPerCall === 0 且没有后端计费的 serviceType / priceYuan） */
export function isFreePaletteConfig(
  config?: Partial<NodeConfig> | null
): boolean {
  if (!config) return false;
  const credits = Number(config.creditsPerCall ?? 0);
  if (!Number.isFinite(credits) || credits !== 0) return false;
  // 有 serviceType 的视为后端计费，creditsPerCall 兜底为 0 也按付费处理
  if (config.serviceType && config.serviceType.trim() !== "") return false;
  // 有 priceYuan > 0 的视为付费
  if (typeof config.priceYuan === "number" && config.priceYuan > 0) return false;
  return true;
}

/** 国际版下面板节点是否允许显示 */
export function isAllowedForInternationalEdition(
  config?: Partial<NodeConfig> | null
): boolean {
  if (!config) return false;
  if (isSeedreamPaletteConfig(config)) return true;
  if (isSeedancePaletteConfig(config)) return true;
  if (isFreePaletteConfig(config)) return true;
  return false;
}
