import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  promptExportWatermarkChoice,
  registerExportWatermarkPrompt,
  resolveExportWatermarkChoice,
} from '@/services/exportWatermarkPrompt';

function ExportWatermarkModal({
  open,
  onChoose,
  onCancel,
}: {
  open: boolean;
  onChoose: (withWatermark: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-watermark-title"
        className="relative w-full max-w-md rounded-2xl bg-white px-6 py-8 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="export-watermark-title"
          className="text-lg font-semibold text-slate-900"
        >
          {t('export.watermark.title')}
        </h2>
        <p className="mt-3 text-[15px] leading-7 text-slate-600">
          {t('export.watermark.description')}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            type="button"
            className="h-11 flex-1 rounded-xl bg-blue-500 text-white hover:bg-blue-600 sm:min-w-[140px] sm:flex-none"
            onClick={() => onChoose(true)}
          >
            {t('export.watermark.withWatermark')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 sm:min-w-[140px] sm:flex-none"
            onClick={() => onChoose(false)}
          >
            {t('export.watermark.withoutWatermark')}
          </Button>
        </div>
        <div className="mt-3 text-center">
          <button
            type="button"
            className="text-sm text-slate-400 hover:text-slate-600"
            onClick={onCancel}
          >
            {t('export.watermark.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExportWatermarkModalHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => registerExportWatermarkPrompt(setOpen), []);

  const modal = (
    <ExportWatermarkModal
      open={open}
      onChoose={(withWatermark) => resolveExportWatermarkChoice(withWatermark)}
      onCancel={() => resolveExportWatermarkChoice(null)}
    />
  );

  return createPortal(modal, document.body);
}

export { promptExportWatermarkChoice };
