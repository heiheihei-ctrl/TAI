import React from "react";
import {
  buildPreviewRequestSignature,
  previewCredits,
} from "@/services/creditsPreviewService";

type Params = {
  serviceType?: string | null;
  model?: string | null;
  requestParams?: Record<string, any> | null;
  outputImageCount?: number;
  enabled?: boolean;
};

export const useBackendCreditsPreview = ({
  serviceType,
  model,
  requestParams,
  outputImageCount,
  enabled = true,
}: Params) => {
  const [credits, setCredits] = React.useState<number | undefined>(undefined);
  const [available, setAvailable] = React.useState<boolean>(true);
  const [unavailableReason, setUnavailableReason] = React.useState<string | null>(null);
  const requestSignature = React.useMemo(() => {
    if (!enabled || !serviceType) return "";
    return buildPreviewRequestSignature({
      serviceType,
      model: model || undefined,
      requestParams: requestParams || undefined,
      outputImageCount,
    });
  }, [enabled, model, outputImageCount, requestParams, serviceType]);

  React.useEffect(() => {
    if (!enabled || !serviceType) {
      setCredits(undefined);
      setAvailable(true);
      setUnavailableReason(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      previewCredits({
        serviceType,
        model: model || undefined,
        requestParams: requestParams || undefined,
        outputImageCount,
      })
        .then((result) => {
          if (cancelled) return;
          const isAvailable = result?.available !== false;
          setAvailable(isAvailable);
          setUnavailableReason(
            isAvailable ? null : result?.unavailableReason ?? null,
          );
          const nextCredits = Number(result?.credits);
          setCredits(
            isAvailable && Number.isFinite(nextCredits) && nextCredits > 0
              ? nextCredits
              : undefined,
          );
        })
        .catch(() => {
          if (cancelled) return;
          setCredits(undefined);
          setAvailable(true);
          setUnavailableReason(null);
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, outputImageCount, requestSignature, serviceType]);

  return {
    credits,
    hasCredits: typeof credits === "number" && credits > 0,
    available,
    unavailableReason,
  };
};
