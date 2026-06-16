import React from 'react';
import type { Node as RFNode } from 'reactflow';
import { useReactFlow, useViewport } from 'reactflow';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useLocaleText } from '@/utils/localeText';
import {
  applyScaleToNodes,
  computeNodesBounds,
  computeUniformScaleFromCornerDrag,
  getBoundsCenter,
  resolveNodeResizeSnapshot,
  type FlowBounds,
  type FlowNodeResizeSnapshot,
  type FlowResizeCorner,
} from '@/components/flow/utils/flowNodeResizeUtils';

type Props = {
  nodes: RFNode[];
  setNodes: React.Dispatch<React.SetStateAction<RFNode[]>>;
  isGroupNode: (node?: RFNode | null) => boolean;
  hiddenNodeIds?: Set<string>;
  disabled?: boolean;
  onResizeEnd?: () => void;
};

const CORNERS: FlowResizeCorner[] = ['nw', 'ne', 'sw', 'se'];

const cornerCursor: Record<FlowResizeCorner, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
};

const SCALE_STEP = 1.12;

export function FlowMultiSelectionResizer({
  nodes,
  setNodes,
  isGroupNode,
  hiddenNodeIds,
  disabled,
  onResizeEnd,
}: Props) {
  const { lt } = useLocaleText();
  const rf = useReactFlow();
  const viewport = useViewport();
  const dragRef = React.useRef<{
    corner: FlowResizeCorner;
    bounds: FlowBounds;
    snapshots: FlowNodeResizeSnapshot[];
    anchor: { x: number; y: number };
  } | null>(null);

  const selectedSnapshots = React.useMemo(() => {
    return nodes
      .filter(
        (node) =>
          node.selected &&
          !isGroupNode(node) &&
          !hiddenNodeIds?.has(node.id) &&
          !(node as RFNode & { hidden?: boolean }).hidden,
      )
      .map((node) => resolveNodeResizeSnapshot(node));
  }, [nodes, isGroupNode, hiddenNodeIds]);

  const bounds = React.useMemo(
    () => computeNodesBounds(selectedSnapshots),
    [selectedSnapshots],
  );

  const applyScale = React.useCallback(
    (
      snapshots: FlowNodeResizeSnapshot[],
      scale: number,
      anchor: { x: number; y: number },
    ) => {
      setNodes((current) => applyScaleToNodes(current, snapshots, scale, anchor));
    },
    [setNodes],
  );

  const refreshNodeInternals = React.useCallback(
    (snapshots: FlowNodeResizeSnapshot[]) => {
      snapshots.forEach((item) => {
        try {
          (rf as any).updateNodeInternals?.(item.id);
        } catch {}
      });
    },
    [rf],
  );

  const scaleSelection = React.useCallback(
    (factor: number) => {
      if (!bounds || selectedSnapshots.length < 2) return;
      const anchor = getBoundsCenter(bounds);
      applyScale(selectedSnapshots, factor, anchor);
      refreshNodeInternals(selectedSnapshots);
      onResizeEnd?.();
    },
    [applyScale, bounds, onResizeEnd, refreshNodeInternals, selectedSnapshots],
  );

  const endDrag = React.useCallback(() => {
    dragRef.current = null;
    document.body.classList.remove('tanva-flow-multi-resizing');
    onResizeEnd?.();
  }, [onResizeEnd]);

  const handleCornerMouseDown = React.useCallback(
    (corner: FlowResizeCorner) => (event: React.MouseEvent) => {
      if (!bounds || selectedSnapshots.length < 2 || disabled) return;
      event.preventDefault();
      event.stopPropagation();

      const anchorCorner =
        corner === 'nw'
          ? 'se'
          : corner === 'ne'
          ? 'sw'
          : corner === 'sw'
          ? 'ne'
          : 'nw';
      const anchorPoint = (() => {
        switch (anchorCorner) {
          case 'nw':
            return { x: bounds.x, y: bounds.y };
          case 'ne':
            return { x: bounds.x + bounds.width, y: bounds.y };
          case 'sw':
            return { x: bounds.x, y: bounds.y + bounds.height };
          case 'se':
          default:
            return {
              x: bounds.x + bounds.width,
              y: bounds.y + bounds.height,
            };
        }
      })();

      dragRef.current = {
        corner,
        bounds,
        snapshots: selectedSnapshots,
        anchor: anchorPoint,
      };
      document.body.classList.add('tanva-flow-multi-resizing');

      const onMouseMove = (moveEvent: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const pointer = rf.screenToFlowPosition({
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        });
        const scale = computeUniformScaleFromCornerDrag(
          drag.bounds,
          drag.corner,
          pointer,
        );
        applyScale(drag.snapshots, scale, drag.anchor);
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('mouseup', onMouseUp, true);
        const drag = dragRef.current;
        if (drag) {
          refreshNodeInternals(drag.snapshots);
        }
        endDrag();
      };

      window.addEventListener('mousemove', onMouseMove, true);
      window.addEventListener('mouseup', onMouseUp, true);
    },
    [applyScale, bounds, disabled, endDrag, refreshNodeInternals, rf, selectedSnapshots],
  );

  if (disabled || selectedSnapshots.length < 2 || !bounds) {
    return null;
  }

  const zoom = Math.max(0.1, Number(viewport.zoom) || 1);
  const left = bounds.x * zoom + viewport.x;
  const top = bounds.y * zoom + viewport.y;
  const width = bounds.width * zoom;
  const height = bounds.height * zoom;

  return (
    <>
      <div
        className='tanva-flow-multi-selection-resizer'
        style={{
          position: 'absolute',
          left,
          top,
          width,
          height,
          pointerEvents: 'none',
          zIndex: 6,
        }}
      >
        <div
          className='tanva-flow-multi-selection-frame'
          style={{
            position: 'absolute',
            inset: 0,
            border: '1px dashed rgba(37, 99, 235, 0.85)',
            borderRadius: 8,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.65)',
            pointerEvents: 'none',
          }}
        />
        {CORNERS.map((corner) => {
          const handleStyle: React.CSSProperties = {
            position: 'absolute',
            width: 12,
            height: 12,
            borderRadius: 3,
            border: '1px solid #2563eb',
            background: '#fff',
            boxShadow: '0 1px 4px rgba(37, 99, 235, 0.35)',
            pointerEvents: 'auto',
            cursor: cornerCursor[corner],
          };
          if (corner === 'nw') {
            handleStyle.left = -6;
            handleStyle.top = -6;
          }
          if (corner === 'ne') {
            handleStyle.right = -6;
            handleStyle.top = -6;
          }
          if (corner === 'sw') {
            handleStyle.left = -6;
            handleStyle.bottom = -6;
          }
          if (corner === 'se') {
            handleStyle.right = -6;
            handleStyle.bottom = -6;
          }
          return (
            <div
              key={corner}
              className='tanva-flow-multi-selection-handle'
              style={handleStyle}
              onMouseDown={handleCornerMouseDown(corner)}
            />
          );
        })}
      </div>

      <div
        className='tanva-flow-multi-selection-toolbar'
        style={{
          position: 'absolute',
          left: left + width / 2,
          top: Math.max(8, top - 38),
          transform: 'translateX(-50%)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderRadius: 999,
          border: '1px solid #dbeafe',
          background: 'rgba(255,255,255,0.96)',
          boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
          zIndex: 7,
          pointerEvents: 'auto',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type='button'
          title={lt('缩小选中节点', 'Shrink selected nodes')}
          onClick={() => scaleSelection(1 / SCALE_STEP)}
          style={{
            border: '1px solid #e5e7eb',
            background: '#fff',
            borderRadius: 999,
            width: 28,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ZoomOut size={14} />
        </button>
        <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>
          {lt('统一缩放', 'Uniform scale')}
        </span>
        <button
          type='button'
          title={lt('放大选中节点', 'Enlarge selected nodes')}
          onClick={() => scaleSelection(SCALE_STEP)}
          style={{
            border: '1px solid #e5e7eb',
            background: '#fff',
            borderRadius: 999,
            width: 28,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ZoomIn size={14} />
        </button>
      </div>
    </>
  );
}

export default FlowMultiSelectionResizer;
