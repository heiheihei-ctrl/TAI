import React from 'react';
import { useReactFlow } from 'reactflow';

type BoxSizeData = {
  boxW?: number;
  boxH?: number;
  boxWidth?: number;
  boxHeight?: number;
};

type UseFlowNodeBoxSizeOptions = {
  id: string;
  data: BoxSizeData;
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
  widthKey?: 'boxW' | 'boxWidth';
  heightKey?: 'boxH' | 'boxHeight';
};

export function useFlowNodeBoxSize({
  id,
  data,
  defaultWidth,
  defaultHeight,
  minWidth = 180,
  minHeight = 120,
  widthKey = 'boxW',
  heightKey = 'boxH',
}: UseFlowNodeBoxSizeOptions) {
  const rf = useReactFlow();

  const readWidth = data[widthKey] ?? (widthKey === 'boxW' ? data.boxWidth : data.boxW);
  const readHeight = data[heightKey] ?? (heightKey === 'boxH' ? data.boxHeight : data.boxH);

  const resolvedWidth =
    typeof readWidth === 'number' && Number.isFinite(readWidth) && readWidth > 0
      ? readWidth
      : defaultWidth;
  const resolvedHeight =
    typeof readHeight === 'number' && Number.isFinite(readHeight) && readHeight > 0
      ? readHeight
      : defaultHeight;

  const [isResizing, setIsResizing] = React.useState(false);
  const resizeRafRef = React.useRef<number | null>(null);
  const resizePendingRef = React.useRef<{ w: number; h: number } | null>(null);

  const updateNodeSize = React.useCallback(
    (width: number, height: number) => {
      const nextWidth = Math.max(minWidth, Math.round(width));
      const nextHeight = Math.max(minHeight, Math.round(height));
      rf.setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const prevData = (node.data || {}) as BoxSizeData;
          const prevW = prevData[widthKey] ?? prevData.boxW ?? prevData.boxWidth;
          const prevH = prevData[heightKey] ?? prevData.boxH ?? prevData.boxHeight;
          if (prevW === nextWidth && prevH === nextHeight) return node;
          return {
            ...node,
            data: {
              ...prevData,
              [widthKey]: nextWidth,
              [heightKey]: nextHeight,
            },
          };
        })
      );
    },
    [heightKey, id, minHeight, minWidth, rf, widthKey]
  );

  const flushResize = React.useCallback(() => {
    resizeRafRef.current = null;
    const pending = resizePendingRef.current;
    resizePendingRef.current = null;
    if (!pending) return;
    updateNodeSize(pending.w, pending.h);
  }, [updateNodeSize]);

  const scheduleResize = React.useCallback(
    (width: number, height: number) => {
      resizePendingRef.current = { w: width, h: height };
      if (resizeRafRef.current != null) return;
      resizeRafRef.current = window.requestAnimationFrame(flushResize);
    },
    [flushResize]
  );

  React.useEffect(
    () => () => {
      if (resizeRafRef.current != null) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      resizePendingRef.current = null;
    },
    []
  );

  const handleResizeStart = React.useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleResize = React.useCallback(
    (_event: unknown, params: { width: number; height: number }) => {
      if (!params) return;
      scheduleResize(params.width, params.height);
    },
    [scheduleResize]
  );

  const handleResizeEnd = React.useCallback(
    (_event: unknown, params: { width: number; height: number }) => {
      setIsResizing(false);
      if (!params) return;
      updateNodeSize(params.width, params.height);
    },
    [updateNodeSize]
  );

  return {
    boxW: resolvedWidth,
    boxH: resolvedHeight,
    isResizing,
    handleResizeStart,
    handleResize,
    handleResizeEnd,
  };
}

export default useFlowNodeBoxSize;
