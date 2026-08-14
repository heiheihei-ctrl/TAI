import { fetchWithAuth } from "./authFetch";
import { getApiBaseUrl } from "@/utils/assetProxy";
import i18n from "@/i18n";

export type PricingEdition = "domestic" | "international";

export const resolvePricingEdition = (
  locale?: string | null,
): PricingEdition => {
  const value = String(locale ?? "").toLowerCase().trim();
  return value.startsWith("en") ? "international" : "domestic";
};

export type CreditsPreviewRequest = {
  serviceType: string;
  model?: string;
  requestParams?: Record<string, any>;
  outputImageCount?: number;
  edition?: PricingEdition;
};

export type CreditsPreviewResponse = {
  serviceType: string;
  serviceName: string;
  provider: string | null;
  model: string | null;
  credits: number;
  balance: number;
  sufficient: boolean;
  managedPricing?: {
    source?: string;
    vendorKey?: string;
    ruleKey?: string;
    label?: string;
    evaluatorKey?: string;
    evaluatorType?: string;
    pricingVersion?: string;
    price?: {
      credits?: number;
      priceYuan?: number;
      costYuan?: number;
    };
  } | null;
  requestParams?: Record<string, any> | null;
  edition?: PricingEdition;
  available?: boolean;
  unavailableReason?: string;
  internationalMultiplier?: number;
};

export const stableSerializePreviewPayload = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializePreviewPayload(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerializePreviewPayload(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const buildPreviewRequestSignature = (payload: CreditsPreviewRequest): string => {
  const edition =
    payload.edition ?? resolvePricingEdition(i18n.resolvedLanguage ?? i18n.language);
  return stableSerializePreviewPayload({
    serviceType: payload.serviceType,
    model: payload.model || null,
    requestParams: payload.requestParams || null,
    outputImageCount: payload.outputImageCount ?? null,
    edition,
  });
};

const PREVIEW_CACHE_TTL_MS = 30000;
const previewResponseCache = new Map<
  string,
  { expiresAt: number; value: CreditsPreviewResponse }
>();
const previewInflightCache = new Map<string, Promise<CreditsPreviewResponse>>();

export async function previewCredits(
  payload: CreditsPreviewRequest
): Promise<CreditsPreviewResponse> {
  const edition =
    payload.edition ?? resolvePricingEdition(i18n.resolvedLanguage ?? i18n.language);
  const enrichedPayload: CreditsPreviewRequest = { ...payload, edition };
  const signature = buildPreviewRequestSignature(enrichedPayload);
  const now = Date.now();
  const cached = previewResponseCache.get(signature);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inflight = previewInflightCache.get(signature);
  if (inflight) {
    return inflight;
  }

  const apiBaseUrl = getApiBaseUrl();
  const request = fetchWithAuth(`${apiBaseUrl}/api/credits/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(enrichedPayload),
  })
    .then(async (response) => {
      if (!response.ok) {
        const error = await response.text().catch(() => "");
        throw new Error(error || `HTTP ${response.status}`);
      }

      const result = (await response.json()) as CreditsPreviewResponse;
      previewResponseCache.set(signature, {
        value: result,
        expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS,
      });
      return result;
    })
    .finally(() => {
      previewInflightCache.delete(signature);
    });

  previewInflightCache.set(signature, request);
  return request;
}
