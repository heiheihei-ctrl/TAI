import React, { useEffect, useRef, useState } from 'react';
import { Paintbrush } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadAbrBrushes } from '@/services/abrBrushService';
import type { AbrBrushPreset } from '@/types/abrBrush';
import { useLocaleText } from '@/utils/localeText';
import { getBrushDisplayName } from '@/utils/abrBrushLabels';
import AbrBrushLibraryModal from './AbrBrushLibraryModal';

const QUICK_BRUSH_COUNT = 10;

type AbrBrushPickerProps = {
  selectedBrushId: string | null;
  disabled?: boolean;
  onSelectBrush: (brushId: string | null) => void;
};

const AbrBrushPicker: React.FC<AbrBrushPickerProps> = ({
  selectedBrushId,
  disabled = false,
  onSelectBrush,
}) => {
  const { lt, language } = useLocaleText();
  const [isOpen, setIsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [brushes, setBrushes] = useState<AbrBrushPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  const loadStartedRef = useRef(false);

  useEffect(() => {
    loadAbrBrushes()
      .then((presets) => {
        setBrushes(presets);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isOpen || brushes.length > 0 || loadStartedRef.current) return;

    loadStartedRef.current = true;
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadAbrBrushes()
      .then((presets) => {
        if (cancelled) return;
        setBrushes(presets);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        loadStartedRef.current = false;
        setError(
          err instanceof Error ? err.message : lt('笔刷加载失败', 'Failed to load brushes'),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, brushes.length, lt]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (libraryOpen) return;
      const target = event.target as Node;
      const clickedInPanel = panelRef.current?.contains(target);
      const clickedInButton = buttonRef.current?.contains(target);
      if (!clickedInPanel && !clickedInButton) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
      };
    }
  }, [isOpen, libraryOpen]);

  const selectedBrush =
    brushes.find((brush) => brush.id === selectedBrushId) ?? null;

  const quickBrushes = brushes.slice(0, QUICK_BRUSH_COUNT);
  const hasMoreBrushes = brushes.length > QUICK_BRUSH_COUNT;

  const handleSelect = (brushId: string | null) => {
    onSelectBrush(brushId);
    setIsOpen(false);
  };

  const renderBrushButton = (brush: AbrBrushPreset) => {
    const isActive = selectedBrushId === brush.id;
    return (
      <button
        key={brush.id}
        type='button'
        title={getBrushDisplayName(brush.name, language, brush.packId)}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-lg border px-2 text-xs font-medium transition-colors',
          isActive
            ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
            : 'border-gray-200 bg-white/95 text-gray-700 hover:border-gray-300 hover:bg-gray-50',
        )}
        onClick={() => handleSelect(brush.id)}
      >
        <img
          src={brush.previewDataUrl}
          alt={getBrushDisplayName(brush.name, language, brush.packId)}
          className='h-6 w-6 shrink-0 rounded-sm bg-white object-contain'
        />
        <span className='truncate text-left'>
          {getBrushDisplayName(brush.name, language, brush.packId)}
        </span>
      </button>
    );
  };

  return (
    <div className='relative'>
      <div
        ref={buttonRef}
        className={cn(
          'flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-gray-300 bg-white transition-colors',
          selectedBrushId && 'border-gray-900 bg-gray-100',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        title={lt('笔刷', 'Brush')}
      >
        {selectedBrush ? (
          <img
            src={selectedBrush.previewDataUrl}
            alt={getBrushDisplayName(selectedBrush.name, language, selectedBrush.packId)}
            className='h-5 w-5 rounded-sm object-contain'
          />
        ) : (
          <Paintbrush className='h-4 w-4 text-gray-700' />
        )}
      </div>

      {isOpen && (
        <div
          ref={panelRef}
          className='absolute left-full top-1/2 z-[1010] ml-2 w-52 max-h-[min(420px,70vh)] -translate-y-1/2 overflow-y-auto rounded-xl border border-liquid-glass-light bg-liquid-glass-light p-2 shadow-liquid-glass-lg backdrop-blur-minimal backdrop-saturate-125 scrollbar-hidden'
        >
          <div className='mb-1 px-1 text-[11px] font-medium text-gray-500'>
            {lt('笔刷', 'Brush')}
          </div>

          {loading && (
            <div className='px-2 py-6 text-center text-[11px] text-gray-500'>
              {lt('加载中…', 'Loading…')}
            </div>
          )}

          {!loading && error && (
            <div className='px-2 py-4 text-center text-[11px] text-red-500'>
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className='flex flex-col gap-1'>
              <button
                type='button'
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-lg border px-2 text-xs font-medium transition-colors',
                  !selectedBrushId
                    ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                    : 'border-gray-200 bg-white/95 text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                )}
                onClick={() => handleSelect(null)}
              >
                <Paintbrush className='h-4 w-4 shrink-0' />
                <span className='truncate'>{lt('矢量笔', 'Vector')}</span>
              </button>

              {quickBrushes.map(renderBrushButton)}

              {hasMoreBrushes && (
                <button
                  type='button'
                  className='mt-1 flex h-9 w-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white/80 px-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900'
                  onClick={() => {
                    setLibraryOpen(true);
                    setIsOpen(false);
                  }}
                >
                  {lt('更多', 'More')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <AbrBrushLibraryModal
        isOpen={libraryOpen}
        brushes={brushes}
        selectedBrushId={selectedBrushId}
        onClose={() => setLibraryOpen(false)}
        onSelectBrush={(brushId) => handleSelect(brushId)}
      />
    </div>
  );
};

export default AbrBrushPicker;
