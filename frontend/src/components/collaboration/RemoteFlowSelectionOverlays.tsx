import { useMemo } from 'react';
import type { Node as RFNode } from 'reactflow';
import { useViewport } from 'reactflow';
import {
  resolveNodeResizeSnapshot,
} from '@/components/flow/utils/flowNodeResizeUtils';
import type { CollaborationSelectionState } from '@/services/collaborationSocket';

interface Props {
  nodes: RFNode[];
  /** 远端协作者选中的 Flow 节点 */
  remoteSelections: CollaborationSelectionState[];
  /** 本地当前用户选中的节点 ID */
  localSelectedNodeIds: string[];
  /** 本地用户协作颜色 */
  localColor?: string;
}

type OverlayItem = {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  label?: string;
  dashed: boolean;
};

export default function RemoteFlowSelectionOverlays({
  nodes,
  remoteSelections,
  localSelectedNodeIds,
  localColor = '#c026d3',
}: Props) {
  const viewport = useViewport();

  const nodeMap = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const overlays = useMemo(() => {
    const zoom = Math.max(0.1, Number(viewport.zoom) || 1);
    const offsetX = Number(viewport.x) || 0;
    const offsetY = Number(viewport.y) || 0;
    const items: OverlayItem[] = [];

    const pushNodeOverlay = (
      nodeId: string,
      color: string,
      label: string | undefined,
      dashed: boolean,
      keyPrefix: string,
    ) => {
      const node = nodeMap.get(nodeId);
      if (!node || (node as RFNode & { hidden?: boolean }).hidden) return;
      const snap = resolveNodeResizeSnapshot(node);
      items.push({
        key: `${keyPrefix}-${nodeId}`,
        left: snap.x * zoom + offsetX,
        top: snap.y * zoom + offsetY,
        width: snap.width * zoom,
        height: snap.height * zoom,
        color,
        label,
        dashed,
      });
    };

    for (const selection of remoteSelections) {
      for (const nodeId of selection.flowNodeIds ?? []) {
        pushNodeOverlay(
          nodeId,
          selection.color,
          selection.name,
          true,
          selection.peerId,
        );
      }
    }

    for (const nodeId of localSelectedNodeIds) {
      pushNodeOverlay(nodeId, localColor, undefined, true, 'self');
    }

    return items;
  }, [
    localColor,
    localSelectedNodeIds,
    nodeMap,
    remoteSelections,
    viewport.x,
    viewport.y,
    viewport.zoom,
  ]);

  if (overlays.length === 0) return null;

  return (
    <div className="tanva-flow-remote-selections pointer-events-none absolute inset-0 z-[12]">
      {overlays.map((item) => (
        <div
          key={item.key}
          className="tanva-flow-remote-selection-box"
          style={{
            position: 'absolute',
            left: item.left,
            top: item.top,
            width: item.width,
            height: item.height,
            border: `${item.dashed ? '2px dashed' : '2px solid'} ${item.color}`,
            borderRadius: 8,
            boxSizing: 'border-box',
          }}
        >
          {item.label ? (
            <span
              className="tanva-flow-remote-selection-label"
              style={{
                position: 'absolute',
                top: -20,
                left: 0,
                fontSize: 11,
                lineHeight: '16px',
                padding: '1px 6px',
                borderRadius: 4,
                background: item.color,
                color: '#fff',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
