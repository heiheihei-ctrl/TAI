/**
 * Selection box overlay.
 * Renders above React Flow nodes so the box is always visible.
 */

import React, { useEffect, useState } from 'react';
import paper from 'paper';
import { useCanvasStore } from '@/stores/canvasStore';
import { projectToClientWithViewport } from '@/utils/paperCoords';

interface SelectionBoxBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SelectionBoxOverlay: React.FC = () => {
  const [boxBounds, setBoxBounds] = useState<SelectionBoxBounds | null>(null);
  const zoom = useCanvasStore((s) => s.zoom);
  const panX = useCanvasStore((s) => s.panX);
  const panY = useCanvasStore((s) => s.panY);

  useEffect(() => {
    const handleSelectionBoxUpdate = (event: CustomEvent) => {
      const { startPoint, currentPoint } = event.detail;

      if (!startPoint || !currentPoint || !paper.view?.element) {
        setBoxBounds(null);
        return;
      }

      const canvas = paper.view.element as HTMLCanvasElement;
      const { zoom: z, panX: px, panY: py } = useCanvasStore.getState();
      const start = projectToClientWithViewport(
        canvas,
        startPoint.x,
        startPoint.y,
        z,
        px,
        py,
      );
      const current = projectToClientWithViewport(
        canvas,
        currentPoint.x,
        currentPoint.y,
        z,
        px,
        py,
      );

      const left = Math.min(start.x, current.x);
      const top = Math.min(start.y, current.y);
      const width = Math.abs(current.x - start.x);
      const height = Math.abs(current.y - start.y);

      setBoxBounds({ left, top, width, height });
    };

    const handleClear = () => setBoxBounds(null);

    window.addEventListener(
      'selection-box-update',
      handleSelectionBoxUpdate as EventListener,
    );
    window.addEventListener('selection-box-clear', handleClear);

    return () => {
      window.removeEventListener(
        'selection-box-update',
        handleSelectionBoxUpdate as EventListener,
      );
      window.removeEventListener('selection-box-clear', handleClear);
    };
  }, [zoom, panX, panY]);

  if (!boxBounds || boxBounds.width < 1 || boxBounds.height < 1) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed z-[9999]"
      style={{
        left: boxBounds.left,
        top: boxBounds.top,
        width: boxBounds.width,
        height: boxBounds.height,
        border: '1px solid rgba(59, 130, 246, 0.9)',
        background: 'rgba(59, 130, 246, 0.12)',
      }}
    />
  );
};

export default SelectionBoxOverlay;
