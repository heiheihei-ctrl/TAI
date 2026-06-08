import React from 'react';
import { NodeResizeControl } from '@reactflow/node-resizer';

export const FLOW_NODE_RESIZE_EDGE = 8;

const lineControlConfigs = [
  {
    position: 'top' as const,
    style: {
      top: 0,
      bottom: 'auto',
      left: 0,
      right: 'auto',
      width: '100%',
      height: FLOW_NODE_RESIZE_EDGE,
      transform: 'none',
      cursor: 'ns-resize',
      pointerEvents: 'auto' as const,
    },
  },
  {
    position: 'bottom' as const,
    style: {
      top: 'auto',
      bottom: 0,
      left: 0,
      right: 'auto',
      width: '100%',
      height: FLOW_NODE_RESIZE_EDGE,
      transform: 'none',
      cursor: 'ns-resize',
      pointerEvents: 'auto' as const,
    },
  },
];

const handleControlConfigs = [
  {
    position: 'top-left' as const,
    style: {
      width: 20,
      height: 20,
      pointerEvents: 'auto' as const,
      cursor: 'nwse-resize',
    },
  },
  {
    position: 'top-right' as const,
    style: {
      width: 20,
      height: 20,
      pointerEvents: 'auto' as const,
      cursor: 'nesw-resize',
    },
  },
  {
    position: 'bottom-left' as const,
    style: {
      width: 20,
      height: 20,
      pointerEvents: 'auto' as const,
      cursor: 'nesw-resize',
    },
  },
  {
    position: 'bottom-right' as const,
    style: {
      width: 20,
      height: 20,
      pointerEvents: 'auto' as const,
      cursor: 'nwse-resize',
    },
  },
];

type FlowNodeResizeControlsProps = {
  minWidth: number;
  minHeight: number;
  onResizeStart?: () => void;
  onResize: (event: unknown, params: { width: number; height: number }) => void;
  onResizeEnd?: (event: unknown, params: { width: number; height: number }) => void;
  disabled?: boolean;
};

/** 与 Image 节点相同的四角 + 上下边缩放控件 */
export function FlowNodeResizeControls({
  minWidth,
  minHeight,
  onResizeStart,
  onResize,
  onResizeEnd,
  disabled,
}: FlowNodeResizeControlsProps) {
  if (disabled) return null;

  return (
    <>
      {lineControlConfigs.map((config) => (
        <NodeResizeControl
          key={`line-${config.position}`}
          position={config.position}
          variant="line"
          className="flow-node-resize-line"
          style={config.style}
          minWidth={minWidth}
          minHeight={minHeight}
          onResizeStart={onResizeStart}
          onResize={onResize}
          onResizeEnd={onResizeEnd}
        />
      ))}
      {handleControlConfigs.map((config) => (
        <NodeResizeControl
          key={`handle-${config.position}`}
          position={config.position}
          className="flow-node-resize-handle"
          style={config.style}
          minWidth={minWidth}
          minHeight={minHeight}
          onResizeStart={onResizeStart}
          onResize={onResize}
          onResizeEnd={onResizeEnd}
        />
      ))}
    </>
  );
}

export default FlowNodeResizeControls;
