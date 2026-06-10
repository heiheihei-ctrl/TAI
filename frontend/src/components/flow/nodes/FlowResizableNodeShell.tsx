import React from 'react';
import useNodeInternalsSync from '../hooks/useNodeInternalsSync';
import { useFlowNodeBoxSize } from '../hooks/useFlowNodeBoxSize';
import FlowNodeResizeControls from './FlowNodeResizeControls';
import {
  getFlowNodeDefaultSize,
  type FlowNodeTypeKey,
} from '../constants/flowNodeDefaults';

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
  /** 与 FLOW_NODE_DEFAULT_SIZE 对齐，避免各节点硬编码默认宽高 */
  nodeType?: FlowNodeTypeKey | string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  /** true=始终可拖；selected=仅选中时可拖 */
  resizerVisible?: boolean | 'selected';
  widthKey?: 'boxW' | 'boxWidth';
  heightKey?: 'boxH' | 'boxHeight';
  className?: string;
  style?: React.CSSProperties;
  onResizingChange?: (isResizing: boolean) => void;
  onResize?: (width: number, height: number) => void;
  onResizeEnd?: (width: number, height: number) => void;
  children: React.ReactNode;
};

/**
 * 统一节点外框缩放：四角 + 上下边拖拽，持久化 boxW/boxH。
 * boxH 作为用户设定的最小高度；内容超出时由 DOM 自然撑高，避免字段和错误信息被裁切。
 */
export function FlowResizableNodeShell({
  id,
  data,
  selected,
  nodeType,
  defaultWidth,
  defaultHeight,
  minWidth = 180,
  minHeight = 120,
  resizerVisible = true,
  widthKey = 'boxW',
  heightKey = 'boxH',
  className,
  style,
  onResizingChange,
  onResize,
  onResizeEnd,
  children,
}: FlowResizableNodeShellProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const sizeDefaults = getFlowNodeDefaultSize(nodeType);
  const resolvedDefaultWidth = defaultWidth ?? sizeDefaults.w;
  const resolvedDefaultHeight = defaultHeight ?? sizeDefaults.h;

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
    defaultWidth: resolvedDefaultWidth,
    defaultHeight: resolvedDefaultHeight,
    minWidth,
    minHeight,
    widthKey,
    heightKey,
    onResize,
    onResizeEnd,
  });

  React.useEffect(() => {
    onResizingChange?.(isResizing);
  }, [isResizing, onResizingChange]);

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
        minHeight: boxH,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'visible',
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
      <div className="flow-resizable-node__body">{children}</div>
    </div>
  );
}

export default FlowResizableNodeShell;
