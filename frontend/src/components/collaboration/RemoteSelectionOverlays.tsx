import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import paper from 'paper';
import {
  collaborationSocket,
  dedupeByUserId,
  type CollaborationSelectionState,
} from '@/services/collaborationSocket';
import { projectToClient } from '@/utils/paperCoords';
import { useCanvasStore } from '@/stores/canvasStore';

interface Props {
  canvas: HTMLCanvasElement | null;
  selections: CollaborationSelectionState[];
}

type ScreenRect = { left: number; top: number; width: number; height: number };

function resolveInstanceBounds(
  ids: string[],
  collection: Array<{ id?: string; bounds?: { x: number; y: number; width: number; height: number } }> | undefined,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (!Array.isArray(collection) || ids.length === 0) return [];
  const idSet = new Set(ids);
  return collection
    .filter((item) => item?.id && idSet.has(item.id) && item.bounds)
    .map((item) => item.bounds!);
}

function projectRectToScreen(
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
): ScreenRect {
  const tl = projectToClient(canvas, new paper.Point(rect.x, rect.y));
  const br = projectToClient(
    canvas,
    new paper.Point(rect.x + rect.width, rect.y + rect.height),
  );
  return {
    left: tl.x,
    top: tl.y,
    width: br.x - tl.x,
    height: br.y - tl.y,
  };
}

function RemoteSelectionGroup({
  canvas,
  selection,
  viewportKey,
}: {
  canvas: HTMLCanvasElement;
  selection: CollaborationSelectionState;
  viewportKey: string;
}) {
  const screenRects = useMemo(() => {
    void viewportKey;
    const win = window as any;
    const imageBounds = resolveInstanceBounds(selection.imageIds, win.tanvaImageInstances);
    const modelBounds = resolveInstanceBounds(selection.modelIds, win.tanvaModel3DInstances);
    const videoBounds = resolveInstanceBounds(selection.videoIds, win.tanvaVideoInstances);
    const textBounds = resolveInstanceBounds(selection.textIds, win.tanvaTextItems);

    const allRects = [
      ...imageBounds,
      ...modelBounds,
      ...videoBounds,
      ...textBounds,
      ...(selection.pathBounds ?? []),
    ];

    if (selection.marqueeBounds) {
      allRects.push(selection.marqueeBounds);
    }

    return allRects
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => projectRectToScreen(canvas, rect));
  }, [canvas, selection, viewportKey]);

  if (screenRects.length === 0) return null;

  return (
    <>
      {screenRects.map((rect, index) => (
        <div
          key={`${selection.userId}-${index}`}
          className="pointer-events-none fixed z-[9998] rounded-sm"
          style={{
            left: rect.left,
            top: rect.top,
            width: Math.max(1, rect.width),
            height: Math.max(1, rect.height),
            border: `2px solid ${selection.color}`,
            boxShadow: `0 0 0 1px rgba(255,255,255,0.6)`,
          }}
        >
          {index === 0 && (
            <div
              className="absolute -top-5 left-0 max-w-[160px] truncate rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow"
              style={{ backgroundColor: selection.color }}
            >
              {selection.name}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export default function RemoteSelectionOverlays({ canvas, selections }: Props) {
  const panX = useCanvasStore((s) => s.panX);
  const panY = useCanvasStore((s) => s.panY);
  const zoom = useCanvasStore((s) => s.zoom);
  const viewportKey = `${panX}:${panY}:${zoom}`;

  if (!canvas || selections.length === 0 || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <>
      {selections.map((selection) => (
        <RemoteSelectionGroup
          key={selection.userId}
          canvas={canvas}
          selection={selection}
          viewportKey={viewportKey}
        />
      ))}
    </>,
    document.body,
  );
}
