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
  const [resolvedSignature, setResolvedSignature] = React.useState("");
  const [failed, setFailed] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);
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
    setFailed(false);
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
            isAvailable && Number.isFinite(nextCredits) && nextCredits >= 0
              ? nextCredits
              : undefined,
          );
          setResolvedSignature(requestSignature);
        })
        .catch(() => {
          if (cancelled) return;
          setFailed(true);
          setCredits(undefined);
          setAvailable(true);
          setUnavailableReason(null);
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, outputImageCount, requestSignature, serviceType, retryCount]);

  return {
    credits: resolvedSignature === requestSignature ? credits : undefined,
    hasCredits: resolvedSignature === requestSignature && typeof credits === "number" && credits > 0,
    available: resolvedSignature === requestSignature ? available : true,
    unavailableReason: resolvedSignature === requestSignature ? unavailableReason : null,
    failed,
    retry: () => setRetryCount(retryCount + 1),
  };
};
