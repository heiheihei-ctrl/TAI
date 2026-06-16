import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { getEraserRadius } from '@/utils/rasterEraser';

type EraserCursorOverlayProps = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  visible: boolean;
  eraserSize: number;
  zoom: number;
};

const EraserCursorOverlay: React.FC<EraserCursorOverlayProps> = ({
  canvasRef,
  visible,
  eraserSize,
  zoom,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const needsRedrawRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const radius = useMemo(() => getEraserRadius(eraserSize), [eraserSize]);
  const diameter = radius * 2 * Math.max(zoom, 0.0001);

  const redraw = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const cursor = cursorRef.current;
    if (!cursor) {
      overlay.style.display = 'none';
      needsRedrawRef.current = false;
      return;
    }

    overlay.style.display = 'block';
    overlay.style.left = `${cursor.x}px`;
    overlay.style.top = `${cursor.y}px`;
    overlay.style.width = `${diameter}px`;
    overlay.style.height = `${diameter}px`;
    needsRedrawRef.current = false;
  }, [diameter]);

  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (needsRedrawRef.current) {
        redraw();
      }
    });
  }, [redraw]);

  useEffect(() => {
    if (needsRedrawRef.current) {
      scheduleRedraw();
    }
  }, [diameter, scheduleRedraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) {
      cursorRef.current = null;
      needsRedrawRef.current = true;
      scheduleRedraw();
      return undefined;
    }

    const updateCursor = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      cursorRef.current = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
      needsRedrawRef.current = true;
      scheduleRedraw();
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateCursor(event.clientX, event.clientY);
    };

    const handlePointerLeave = () => {
      cursorRef.current = null;
      needsRedrawRef.current = true;
      scheduleRedraw();
    };

    canvas.style.cursor = 'none';
    canvas.addEventListener('pointerenter', handlePointerMove);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      canvas.style.cursor = '';
      canvas.removeEventListener('pointerenter', handlePointerMove);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [canvasRef, visible, scheduleRedraw]);

  if (!visible) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute z-[12] hidden"
      style={{
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="h-full w-full rounded-full border border-gray-700/70 bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.65)_inset]" />
    </div>
  );
};

export default EraserCursorOverlay;
