import React, { useEffect, useMemo, useState } from 'react';
import { getEraserRadius } from '@/utils/rasterEraser';

type EraserCursorOverlayProps = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  visible: boolean;
  strokeWidth: number;
  zoom: number;
};

const EraserCursorOverlay: React.FC<EraserCursorOverlayProps> = ({
  canvasRef,
  visible,
  strokeWidth,
  zoom,
}) => {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const radius = useMemo(() => getEraserRadius(strokeWidth), [strokeWidth]);
  const diameter = radius * 2 * Math.max(zoom, 0.0001);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) {
      setCursor(null);
      return undefined;
    }

    const handleMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      setCursor({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    const handleLeave = () => {
      setCursor(null);
    };

    canvas.style.cursor = 'none';
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseenter', handleMove);
    canvas.addEventListener('mouseleave', handleLeave);

    return () => {
      canvas.style.cursor = '';
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseenter', handleMove);
      canvas.removeEventListener('mouseleave', handleLeave);
    };
  }, [canvasRef, visible]);

  if (!visible || !cursor) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute z-[12]"
      style={{
        left: cursor.x,
        top: cursor.y,
        width: diameter,
        height: diameter,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div
        className="h-full w-full rounded-full border border-gray-700/70 bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.65)_inset]"
      />
    </div>
  );
};

export default EraserCursorOverlay;
