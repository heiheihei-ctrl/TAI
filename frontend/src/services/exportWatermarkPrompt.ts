type ExportWatermarkChoiceListener = (open: boolean) => void;
type ExportWatermarkResolver = (choice: boolean | null) => void;

let openListener: ExportWatermarkChoiceListener | null = null;
let pendingResolver: ExportWatermarkResolver | null = null;

export function registerExportWatermarkPrompt(listener: ExportWatermarkChoiceListener) {
  openListener = listener;
  return () => {
    if (openListener === listener) {
      openListener = null;
    }
  };
}

export function promptExportWatermarkChoice(): Promise<boolean | null> {
  if (!openListener) {
    return Promise.resolve(false);
  }

  if (pendingResolver) {
    pendingResolver(null);
    pendingResolver = null;
  }

  return new Promise<boolean | null>((resolve) => {
    pendingResolver = resolve;
    openListener?.(true);
  });
}

export function resolveExportWatermarkChoice(choice: boolean | null) {
  openListener?.(false);
  pendingResolver?.(choice);
  pendingResolver = null;
}
