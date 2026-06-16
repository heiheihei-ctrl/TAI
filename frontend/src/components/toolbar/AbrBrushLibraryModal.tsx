import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Paintbrush, X } from 'lucide-react';
import type { AbrBrushPreset } from '@/types/abrBrush';
import { useLocaleText } from '@/utils/localeText';
import { getBrushDisplayName } from '@/utils/abrBrushLabels';
import {
  filterBrushesByCategory,
  getBrushCategoryLabel,
  getVisibleBrushCategories,
  type BrushCategoryId,
} from '@/utils/abrBrushCategories';

type AbrBrushLibraryModalProps = {
  isOpen: boolean;
  brushes: AbrBrushPreset[];
  selectedBrushId: string | null;
  onClose: () => void;
  onSelectBrush: (brushId: string | null) => void;
};

const AbrBrushLibraryModal: React.FC<AbrBrushLibraryModalProps> = ({
  isOpen,
  brushes,
  selectedBrushId,
  onClose,
  onSelectBrush,
}) => {
  const { lt, language } = useLocaleText();
  const [activeCategory, setActiveCategory] = useState<BrushCategoryId | ''>('');

  const visibleCategories = useMemo(
    () => getVisibleBrushCategories(brushes),
    [brushes],
  );

  const filteredBrushes = useMemo(
    () => filterBrushesByCategory(brushes, activeCategory),
    [brushes, activeCategory],
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setActiveCategory('');
    }
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleSelect = (brushId: string | null) => {
    onSelectBrush(brushId);
    onClose();
  };

  return createPortal(
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          background: 'rgba(255, 255, 255, 0.45)',
        }}
        data-abr-brush-library
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            boxShadow:
              '0 18px 45px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)',
            width: 'min(60vw, 900px)',
            maxWidth: 900,
            height: '80vh',
            maxHeight: '80vh',
            position: 'relative',
            pointerEvents: 'auto',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
          data-abr-brush-library
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '20px 24px 16px',
              borderBottom: '1px solid #e5e7eb',
              background: '#f5f7fa',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>
              {lt('笔刷库', 'Brush Library')}
            </div>
            <button
              type='button'
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                background: '#fff',
                cursor: 'pointer',
                color: '#374151',
              }}
              aria-label={lt('关闭', 'Close')}
            >
              <X size={16} />
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 24px 24px',
              minHeight: 0,
            }}
          >
            <button
              type='button'
              onClick={() => handleSelect(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                marginBottom: 16,
                padding: '14px 16px',
                borderRadius: 12,
                border:
                  selectedBrushId === null
                    ? '2px solid #18181b'
                    : '1px solid #e5e7eb',
                background: selectedBrushId === null ? '#f4f4f5' : '#fff',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  background: '#f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Paintbrush size={22} color='#374151' />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  {lt('矢量笔', 'Vector')}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  {lt('默认矢量画笔', 'Default vector brush')}
                </div>
              </div>
            </button>

            {visibleCategories.length > 0 && (
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginBottom: 14,
                  marginLeft: -24,
                  marginRight: -24,
                  padding: '8px 24px 10px',
                  background: '#fff',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <button
                  type='button'
                  onClick={() => setActiveCategory('')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 999,
                    border:
                      activeCategory === ''
                        ? '1px solid #18181b'
                        : '1px solid #e5e7eb',
                    background: activeCategory === '' ? '#18181b' : '#fff',
                    color: activeCategory === '' ? '#fff' : '#374151',
                    fontSize: 12,
                    fontWeight: activeCategory === '' ? 600 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow:
                      activeCategory === ''
                        ? '0 10px 18px rgba(0, 0, 0, 0.18)'
                        : 'none',
                  }}
                >
                  {lt('全部', 'All')}
                </button>
                {visibleCategories.map((category) => {
                  const isActive = activeCategory === category.id;
                  return (
                    <button
                      key={category.id}
                      type='button'
                      onClick={() =>
                        setActiveCategory((prev) =>
                          prev === category.id ? '' : category.id,
                        )
                      }
                      style={{
                        padding: '6px 14px',
                        borderRadius: 999,
                        border:
                          isActive ? '1px solid #18181b' : '1px solid #e5e7eb',
                        background: isActive ? '#18181b' : '#fff',
                        color: isActive ? '#fff' : '#374151',
                        fontSize: 12,
                        fontWeight: isActive ? 600 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isActive
                          ? '0 10px 18px rgba(0, 0, 0, 0.18)'
                          : 'none',
                      }}
                    >
                      {getBrushCategoryLabel(category.id, language)}
                    </button>
                  );
                })}
              </div>
            )}

            {activeCategory && (
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#111827',
                  marginBottom: 14,
                }}
              >
                {getBrushCategoryLabel(activeCategory, language)}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 16,
              }}
            >
              {filteredBrushes.map((brush) => {
                const isActive = selectedBrushId === brush.id;
                const displayName = getBrushDisplayName(
                  brush.name,
                  language,
                  brush.packId,
                );
                return (
                  <button
                    key={brush.id}
                    type='button'
                    title={displayName}
                    onClick={() => handleSelect(brush.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                      padding: '14px 10px',
                      borderRadius: 12,
                      border: isActive
                        ? '2px solid #18181b'
                        : '1px solid #e5e7eb',
                      background: isActive ? '#f4f4f5' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      minHeight: 120,
                    }}
                    onMouseEnter={(e) => {
                      if (isActive) return;
                      e.currentTarget.style.borderColor = '#18181b';
                      e.currentTarget.style.background = '#f4f4f5';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow =
                        '0 12px 24px rgba(0, 0, 0, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      if (isActive) return;
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.background = '#fff';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <img
                      src={brush.previewDataUrl}
                      alt={displayName}
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: 'contain',
                        borderRadius: 6,
                        background: '#fff',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#374151',
                        textAlign: 'center',
                        lineHeight: 1.3,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {displayName}
                    </span>
                  </button>
                );
              })}
            </div>

            {filteredBrushes.length === 0 && (
              <div
                style={{
                  padding: '32px 0',
                  textAlign: 'center',
                  fontSize: 13,
                  color: '#6b7280',
                }}
              >
                {lt('该分类暂无笔刷', 'No brushes in this category')}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};

export default AbrBrushLibraryModal;
