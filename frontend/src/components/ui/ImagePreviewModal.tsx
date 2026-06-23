/**
 * 图片全屏预览模态框组件
 */

import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './button';
import SmartImage from './SmartImage';
import './ImagePreviewModal.css';
import { useTranslation } from 'react-i18next';
import { findPreviewImageId } from '@/utils/previewImageMatch';

export interface ImageItem {
  id: string;
  src: string;
  title?: string;
  timestamp?: number;
}

interface ImagePreviewModalProps {
  isOpen: boolean;
  imageSrc: string;
  imageTitle?: string;
  onClose: () => void;
  imageCollection?: ImageItem[];
  /** @deprecated 仅用于兼容；打开预览时以 imageSrc / initialImageId 为准，不再沿用此值 */
  currentImageId?: string;
  /** 打开预览时优先选中的图片（如多图节点某一格） */
  initialImageId?: string;
  onImageChange?: (imageId: string) => void;
  collectionTitle?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  imageSrc,
  imageTitle,
  onClose,
  imageCollection = [],
  initialImageId,
  onImageChange,
  collectionTitle,
  onLoadMore,
  hasMore = false,
  isLoading = false,
}) => {
  const { i18n } = useTranslation();
  const isZh = (i18n.resolvedLanguage || i18n.language || '')
    .toLowerCase()
    .startsWith('zh');
  const lt = (zh: string, en: string) => (isZh ? zh : en);
  const resolvedImageTitle = imageTitle || lt('图片预览', 'Image Preview');
  const resolvedCollectionTitle = collectionTitle || lt('历史记录', 'History');

  const sortedCollection = useMemo(() => {
    return imageCollection
      .map((item, index) => ({ ...item, _originalIndex: index }))
      .sort((a, b) => {
        const timeDiff = (b.timestamp ?? 0) - (a.timestamp ?? 0);
        if (timeDiff !== 0) return timeDiff;
        return a._originalIndex - b._originalIndex;
      })
      .map(({ _originalIndex, ...rest }) => rest as ImageItem);
  }, [imageCollection]);

  const [activeImageId, setActiveImageId] = useState('');
  const prevIsOpenRef = useRef(false);
  const hasCollection = sortedCollection.length > 0;
  const showOrderBadges = hasCollection && sortedCollection.some((item) => typeof item.timestamp === 'number');
  const thumbnailListRef = useRef<HTMLDivElement | null>(null);
  const loadMoreGuardRef = useRef(false);

  const resolveOpenActiveId = useCallback((): string => {
    return findPreviewImageId(imageSrc, sortedCollection, initialImageId);
  }, [imageSrc, initialImageId, sortedCollection]);

  const displayImageSrc = useMemo(() => {
    if (activeImageId && hasCollection) {
      const activeItem = sortedCollection.find((item) => item.id === activeImageId);
      if (activeItem?.src) return activeItem.src;
    }
    return imageSrc;
  }, [activeImageId, hasCollection, imageSrc, sortedCollection]);

  const highlightedImageId = useMemo(() => {
    if (activeImageId) return activeImageId;
    return findPreviewImageId(imageSrc, sortedCollection);
  }, [activeImageId, imageSrc, sortedCollection]);

  // 每次打开预览：以当前节点传入的 imageSrc 重置选中项，避免沿用上次的侧边栏浏览状态
  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    const justClosed = !isOpen && prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (justOpened) {
      setActiveImageId(resolveOpenActiveId());
    } else if (justClosed) {
      setActiveImageId('');
    }
  }, [isOpen, resolveOpenActiveId]);

  // 历史列表异步就绪后，若尚未选中则再尝试匹配 imageSrc
  useEffect(() => {
    if (!isOpen || activeImageId || !imageSrc || !hasCollection) return;
    const matchedId = findPreviewImageId(imageSrc, sortedCollection, initialImageId);
    if (matchedId) {
      setActiveImageId(matchedId);
    }
  }, [activeImageId, hasCollection, imageSrc, initialImageId, isOpen, sortedCollection]);

  const handleThumbnailClick = useCallback((imageId: string) => {
    setActiveImageId(imageId);
    onImageChange?.(imageId);
  }, [onImageChange]);

  const getCurrentImageIndex = useCallback(() => {
    if (!highlightedImageId || !hasCollection) return -1;
    return sortedCollection.findIndex((item) => item.id === highlightedImageId);
  }, [highlightedImageId, sortedCollection, hasCollection]);

  const navigateImage = useCallback((direction: 'prev' | 'next') => {
    if (!hasCollection) return;

    const currentIndex = getCurrentImageIndex();
    if (currentIndex === -1) return;

    const newIndex =
      direction === 'next'
        ? (currentIndex + 1) % sortedCollection.length
        : currentIndex === 0
          ? sortedCollection.length - 1
          : currentIndex - 1;

    const nextId = sortedCollection[newIndex].id;
    setActiveImageId(nextId);
    onImageChange?.(nextId);
  }, [getCurrentImageIndex, hasCollection, onImageChange, sortedCollection]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateImage('prev');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateImage('next');
    }
  }, [onClose, navigateImage]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleKeyDown]);

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleThumbnailScroll = useCallback(() => {
    const container = thumbnailListRef.current;
    if (!container || !onLoadMore || !hasMore || isLoading) return;
    const threshold = 120;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom <= threshold && !loadMoreGuardRef.current) {
      loadMoreGuardRef.current = true;
      onLoadMore();
    }
  }, [hasMore, isLoading, onLoadMore]);

  useEffect(() => {
    if (!isLoading) {
      loadMoreGuardRef.current = false;
    }
  }, [isLoading]);

  if (!isOpen) return null;

  const modalContent = (
    <div
        className="fixed inset-0 flex cursor-pointer"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          backdropFilter: 'blur(4px)',
          zIndex: 999999,
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0
        }}
        onContextMenuCapture={(e) => {
          e.stopPropagation();
        }}
        onClick={handleBackgroundClick}
      >
        <Button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          variant="ghost"
          size="sm"
          className="absolute top-1 right-4 h-8 w-8 p-0 text-white hover:bg-white/20 transition-all duration-200 z-[1000000]"
          title={lt('关闭预览 (ESC)', 'Close preview (ESC)')}
        >
          <X className="h-4 w-4" />
        </Button>

        <div
          className="flex-1 flex items-center justify-center cursor-default"
          style={{ paddingRight: hasCollection ? '240px' : '0' }}
          onClick={(e) => e.stopPropagation()}
        >
          <SmartImage
            key={`${displayImageSrc}-${highlightedImageId}`}
            src={displayImageSrc}
            alt={resolvedImageTitle}
            className="shadow-2xl"
            style={{
              filter: 'drop-shadow(0 25px 50px rgba(0, 0, 0, 0.8))',
              maxWidth: '100%',
              maxHeight: '100vh',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
            }}
            placeholder={
              <div className="text-white/70 text-sm">{lt('加载中...', 'Loading...')}</div>
            }
            onError={(e) => {
              console.error('Preview image load failed:', e);
            }}
          />
        </div>

        {hasCollection && (
          <div
            className="absolute right-0 top-0 bottom-0 w-60 bg-black/80 border-l border-white/10 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white text-sm font-medium">{resolvedCollectionTitle}</h3>
            </div>

            <div
              className="flex-1 overflow-y-auto custom-scrollbar"
              ref={thumbnailListRef}
              onScroll={handleThumbnailScroll}
            >
              <div className="p-2 space-y-2">
                {sortedCollection.map((item, index) => {
                  const isActive = item.id === highlightedImageId;
                  const chronologicalNumber = sortedCollection.length - index;
                  const formattedTimestamp = item.timestamp
                    ? new Date(item.timestamp).toLocaleString()
                    : undefined;
                  const isPngFileName = item.title?.toLowerCase().endsWith('.png') ?? false;
                  const shouldShowBadge = showOrderBadges && !isPngFileName;
                  return (
                    <div
                      key={item.id}
                      className={`group relative cursor-pointer rounded-lg overflow-hidden transition-all duration-200 ${
                        isActive
                          ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-black'
                          : 'hover:ring-1 hover:ring-white/30'
                      }`}
                      onClick={() => handleThumbnailClick(item.id)}
                      title={
                        formattedTimestamp
                          ? lt(`生成时间：${formattedTimestamp}`, `Generated at: ${formattedTimestamp}`)
                          : undefined
                      }
                    >
                      {shouldShowBadge && (
                        <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center shadow">
                          {chronologicalNumber}
                        </div>
                      )}
                      {isPngFileName && isActive && (
                        <div className="absolute top-1 left-1 px-2 py-0.5 rounded-md bg-blue-600 text-white text-[9px] font-semibold flex items-center justify-center shadow-lg whitespace-nowrap z-10">
                          Current
                        </div>
                      )}
                      <div className="aspect-video bg-gray-800">
                        <SmartImage
                          src={item.src}
                          alt={item.title || lt(`图片 ${index + 1}`, `Image ${index + 1}`)}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          placeholder={<div className="w-full h-full bg-gray-800" />}
                        />
                      </div>
                      {item.title && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <p className="text-white text-xs truncate">{item.title}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ImagePreviewModal;
