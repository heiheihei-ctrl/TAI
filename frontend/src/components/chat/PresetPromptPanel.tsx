import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useLocaleText } from '@/utils/localeText';
import {
  fetchPublicPresetPrompts,
  type ChatPresetPromptItem,
} from '@/services/presetPromptService';
import { useUIStore } from '@/stores/uiStore';

interface PresetPromptPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (content: string) => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  containerRef?: React.RefObject<HTMLElement | null>;
}

const PresetPromptPanel: React.FC<PresetPromptPanelProps> = ({
  isOpen,
  onClose,
  onSelectPrompt,
  anchorRef,
  containerRef,
}) => {
  const { lt } = useLocaleText();
  const setShowTemplatePanel = useUIStore((s) => s.setShowTemplatePanel);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<ChatPresetPromptItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('__all__');

  useEffect(() => {
    if (!isOpen) {
      setReady(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPublicPresetPrompts()
      .then((data) => {
        if (cancelled) return;
        setCategories(Array.isArray(data.categories) ? data.categories : []);
        setItems(Array.isArray(data.items) ? data.items : []);
        setActiveCategory('__all__');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : lt('加载失败', 'Load failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, lt]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const anchorEl = anchorRef?.current;
      const containerEl = containerRef?.current;
      const panelEl = panelRef.current;
      if (!anchorEl || !panelEl) return;

      const anchorRect = anchorEl.getBoundingClientRect();
      const containerRect = containerEl?.getBoundingClientRect();
      const panelWidth = panelEl.offsetWidth;
      const panelHeight = panelEl.offsetHeight;
      const offset = 12;

      let top = (containerRect?.top ?? anchorRect.top) - panelHeight - offset;
      let left =
        (containerRect
          ? containerRect.left + containerRect.width / 2 - panelWidth / 2
          : anchorRect.right - panelWidth);

      if (top < 12) {
        top = (containerRect?.bottom ?? anchorRect.bottom) + offset;
      }
      left = Math.max(12, Math.min(left, window.innerWidth - panelWidth - 12));
      top = Math.max(12, Math.min(top, window.innerHeight - panelHeight - 12));

      setPosition({ top, left });
      setReady(true);
    };

    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorRef, containerRef, categories, items, loading]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose, anchorRef]);

  const visibleItems = useMemo(() => {
    if (activeCategory === '__all__') return items;
    return items.filter((item) => item.category === activeCategory);
  }, [activeCategory, items]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      className='fixed z-[10000] flex h-[360px] w-[720px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl'
      style={{
        top: position.top,
        left: position.left,
        visibility: ready ? 'visible' : 'hidden',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className='flex w-[200px] shrink-0 flex-col border-r border-slate-100 bg-slate-50/70'>
        <div className='flex-1 space-y-1 overflow-y-auto p-3'>
          <button
            type='button'
            onClick={() => setActiveCategory('__all__')}
            className={cn(
              'w-full rounded-lg px-3 py-2 text-left text-sm transition',
              activeCategory === '__all__'
                ? 'bg-slate-200/80 font-medium text-slate-900'
                : 'text-slate-600 hover:bg-white'
            )}
          >
            {lt('全部', 'All')}
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type='button'
              onClick={() => setActiveCategory(category)}
              className={cn(
                'w-full rounded-lg px-3 py-2 text-left text-sm transition',
                activeCategory === category
                  ? 'bg-slate-200/80 font-medium text-slate-900'
                  : 'text-slate-600 hover:bg-white'
              )}
              title={category}
            >
              <span className='line-clamp-2'>{category}</span>
            </button>
          ))}
        </div>
        <div className='border-t border-slate-100 p-3'>
          <button
            type='button'
            onClick={() => {
              setShowTemplatePanel(true);
              onClose();
            }}
            className='w-full rounded-xl bg-[#dbe7ff] px-3 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-[#cfe0ff]'
          >
            {lt('进入公共模板', 'Open public templates')}
          </button>
        </div>
      </div>

      <div className='min-w-0 flex-1 overflow-y-auto p-4'>
        {loading ? (
          <div className='flex h-full items-center justify-center text-sm text-slate-400'>
            {lt('加载中...', 'Loading...')}
          </div>
        ) : error ? (
          <div className='flex h-full items-center justify-center text-sm text-red-500'>
            {error}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className='flex h-full items-center justify-center text-sm text-slate-400'>
            {lt('暂无预设提示词', 'No preset prompts')}
          </div>
        ) : (
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {visibleItems.map((item) => (
              <button
                key={item.id}
                type='button'
                onClick={() => {
                  onSelectPrompt(item.content || item.title);
                  onClose();
                }}
                className='rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm text-slate-800 transition hover:border-slate-300 hover:bg-slate-50'
                title={item.content || item.title}
              >
                <span className='line-clamp-2'>{item.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default PresetPromptPanel;
