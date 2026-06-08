import React from 'react';
import useNodeInternalsSync from '../hooks/useNodeInternalsSync';
import { useFlowNodeBoxSize } from '../hooks/useFlowNodeBoxSize';
import FlowNodeResizeControls from './FlowNodeResizeControls';

type BoxSizeData = {
  boxW?: number;
  boxH?: number;
  boxWidth?: number;
  boxHeight?: number;
};

type FlowResizableNodeShellProps = {
  id: string;
  data: BoxSizeData;
  selected?: boolean;
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
  /** true=始终可拖；selected=仅选中时可拖 */
  resizerVisible?: boolean | 'selected';
  widthKey?: 'boxW' | 'boxWidth';
  heightKey?: 'boxH' | 'boxHeight';
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/**
 * 统一节点外框缩放：与 Image 节点相同，四角 + 上下边拖拽，持久化 boxW/boxH。
 * 内部输入区请用 flex:1 + resize:'none'，由外框控制尺寸。
 */
export function FlowResizableNodeShell({
  id,
  data,
  selected,
  defaultWidth,
  defaultHeight,
  minWidth = 180,
  minHeight = 120,
  resizerVisible = true,
  widthKey = 'boxW',
  heightKey = 'boxH',
  className,
  style,
  children,
}: FlowResizableNodeShellProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const {
    boxW,
    boxH,
    isResizing,
    handleResizeStart,
    handleResize,
    handleResizeEnd,
  } = useFlowNodeBoxSize({
    id,
    data,
    defaultWidth,
    defaultHeight,
    minWidth,
    minHeight,
    widthKey,
    heightKey,
  });

  useNodeInternalsSync(id, rootRef, [boxW, boxH]);

  const showResizer = resizerVisible === 'selected' ? !!selected : !!resizerVisible;
  const shellClassName = [
    'flow-resizable-node',
    isResizing ? 'flow-resizable-node--resizing' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className={shellClassName}
      style={{
        width: boxW,
        height: boxH,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        ...style,
      }}
    >
      <FlowNodeResizeControls
        minWidth={minWidth}
        minHeight={minHeight}
        disabled={!showResizer}
        onResizeStart={handleResizeStart}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />
      {children}
    </div>
  );
}

export default FlowResizableNodeShell;
