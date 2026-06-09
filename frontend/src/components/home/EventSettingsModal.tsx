import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  EVENT_SETTINGS_DISMISS_KEY,
  getEventSettingsContentKey,
  openEventSettingsLink,
  type EventSettingsConfig,
} from '@/services/settingsApi';

type EventSettingsModalProps = {
  open: boolean;
  config: EventSettingsConfig | null;
  onClose: () => void;
};

function EventImageCarousel({ images }: { images: string[] }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const count = images.length;
  const hasMultiple = count > 1;

  useEffect(() => {
    setIndex(0);
  }, [images]);

  useEffect(() => {
    if (!hasMultiple) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % count);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [count, hasMultiple]);

  const goPrev = useCallback(() => {
    setIndex((prev) => (prev - 1 + count) % count);
  }, [count]);

  const goNext = useCallback(() => {
    setIndex((prev) => (prev + 1) % count);
  }, [count]);

  if (count === 0) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-slate-100">
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {images.map((url, imageIndex) => (
          <div key={`${url}-${imageIndex}`} className="w-full shrink-0">
            <img
              src={url}
              alt={t('home.eventModal.imageAlt', { index: imageIndex + 1 })}
              className="h-56 w-full object-cover sm:h-64"
            />
          </div>
        ))}
      </div>

      {hasMultiple && (
        <>
          <button
            type="button"
            aria-label={t('home.eventModal.prev')}
            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60"
            onClick={goPrev}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={t('home.eventModal.next')}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60"
            onClick={goNext}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
            {images.map((url, dotIndex) => (
              <button
                key={`dot-${url}-${dotIndex}`}
                type="button"
                aria-label={t('home.eventModal.goToSlide', { index: dotIndex + 1 })}
                className={`h-1.5 rounded-full transition-all ${
                  dotIndex === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                }`}
                onClick={() => setIndex(dotIndex)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function EventSettingsModal({ open, config, onClose }: EventSettingsModalProps) {
  const { t } = useTranslation();

  const handleClose = useCallback(() => {
    if (config) {
      sessionStorage.setItem(EVENT_SETTINGS_DISMISS_KEY, getEventSettingsContentKey(config));
    }
    onClose();
  }, [config, onClose]);

  if (!open || !config) return null;

  const hasLink = config.link.trim().length > 0;
  const hasCopy = config.copy.trim().length > 0;

  const modalContent = (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-settings-modal-title"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <button
          type="button"
          aria-label={t('home.eventModal.close')}
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          onClick={handleClose}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col">
          {config.images.length > 0 && (
            <EventImageCarousel images={config.images} />
          )}

          <div className="space-y-4 px-6 py-5">
            {hasCopy && (
              <p
                id="event-settings-modal-title"
                className="whitespace-pre-wrap text-base leading-relaxed text-slate-700"
              >
                {config.copy.trim()}
              </p>
            )}

            {hasLink && (
              <div className="flex justify-center pt-1">
                <Button
                  className="h-11 min-w-[140px] rounded-xl bg-gray-700 px-8 text-base text-white hover:bg-gray-600"
                  onClick={() => openEventSettingsLink(config.link)}
                >
                  {t('home.eventModal.action')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
