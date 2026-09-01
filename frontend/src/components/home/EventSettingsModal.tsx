import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  dismissStorageKey?: string;
  /** 点击弹窗内容时的回调（不含关闭按钮 / 遮罩 / 轮播控件）；设置后隐藏「跳转」按钮 */
  onDialogClick?: () => void;
};

function EventImageCarousel({
  images,
  stopPropagation = false,
}: {
  images: string[];
  stopPropagation?: boolean;
}) {
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

  const goPrev = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setIndex((prev) => (prev - 1 + count) % count);
    },
    [count],
  );

  const goNext = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setIndex((prev) => (prev + 1) % count);
    },
    [count],
  );

  if (count === 0) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-t-2xl bg-slate-100">
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {images.map((url, imageIndex) => (
          <div key={`${url}-${imageIndex}`} className="w-full shrink-0">
            <img
              src={url}
              alt={t('home.eventModal.imageAlt', { index: imageIndex + 1 })}
              className="block h-auto w-full"
              draggable={false}
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
          <div
            className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5"
            onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
          >
            {images.map((url, dotIndex) => (
              <button
                key={`dot-${url}-${dotIndex}`}
                type="button"
                aria-label={t('home.eventModal.goToSlide', { index: dotIndex + 1 })}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  dotIndex === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(dotIndex);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function EventSettingsModal({
  open,
  config,
  onClose,
  dismissStorageKey = EVENT_SETTINGS_DISMISS_KEY,
  onDialogClick,
}: EventSettingsModalProps) {
  const { t } = useTranslation();

  const handleClose = useCallback(() => {
    if (config) {
      sessionStorage.setItem(dismissStorageKey, getEventSettingsContentKey(config));
    }
    onClose();
  }, [config, dismissStorageKey, onClose]);

  const handleDialogClick = useCallback(() => {
    if (!onDialogClick) return;
    handleClose();
    onDialogClick();
  }, [handleClose, onDialogClick]);

  if (!open || !config) return null;

  const hasImages = config.images.length > 0;
  const hasCopy = config.copy.trim().length > 0;
  const hasLink = config.link.trim().length > 0 && !onDialogClick;
  const hasFooter = hasCopy || hasLink;

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
        aria-labelledby={hasCopy ? 'event-settings-modal-title' : undefined}
        className={cn(
          'relative w-full max-w-[800px] overflow-hidden rounded-2xl bg-white shadow-2xl',
          !hasImages && 'rounded-2xl',
          onDialogClick && 'cursor-pointer transition hover:brightness-[1.02] active:scale-[0.995]',
        )}
        onClick={onDialogClick ? handleDialogClick : undefined}
      >
        <button
          type="button"
          aria-label={t('home.eventModal.close')}
          className={cn(
            'absolute right-3 top-3 z-10 rounded-lg p-1.5 transition',
            hasImages
              ? 'bg-black/45 text-white hover:bg-black/60'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
          )}
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col">
          {hasImages && (
            <EventImageCarousel
              images={config.images}
              stopPropagation={Boolean(onDialogClick)}
            />
          )}

          {hasFooter && (
            <div
              className={cn(
                'space-y-4',
                hasImages ? 'px-6 py-5' : 'px-6 py-6 pt-12',
              )}
            >
              {hasCopy && (
                <p
                  id="event-settings-modal-title"
                  className="whitespace-pre-wrap text-base leading-relaxed text-slate-700"
                >
                  {config.copy.trim()}
                </p>
              )}

              {hasLink && (
                <div className={cn('flex justify-center', hasCopy ? 'pt-1' : '')}>
                  <Button
                    className="h-11 min-w-[140px] rounded-xl bg-gray-700 px-8 text-base text-white hover:bg-gray-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEventSettingsLink(config.link);
                    }}
                  >
                    {t('home.eventModal.action')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
