import React from 'react';
import paper from 'paper';
import { useCanvasStore } from '@/stores';
import { projectToClient, collabWorldToClient, getDpr } from '@/utils/paperCoords';
import type { PeerCursor } from '@/hooks/usePresence';

interface Props {
  cursors: Record<string, PeerCursor>;
}

/**
 * Renders other collaborators' cursors as fixed-position DOM overlays.
 * Prefer Paper projection; fall back to canvasStore viewport transform.
 */
const CollabCursorLayer: React.FC<Props> = ({ cursors }) => {
  const zoom = useCanvasStore((s) => s.zoom);
  const panX = useCanvasStore((s) => s.panX);
  const panY = useCanvasStore((s) => s.panY);
  const viewportKey = `${zoom}:${panX}:${panY}`;

  const entries = Object.values(cursors);
  if (entries.length === 0) return null;

  const paperCanvas = (paper?.view?.element as HTMLCanvasElement | undefined) ?? null;
  const fallbackCanvas =
    paperCanvas ??
    (document.querySelector('canvas.tanva-main-canvas') as HTMLCanvasElement | null);

  const project = (c: PeerCursor): { x: number; y: number } => {
    if (paperCanvas && paper?.view) {
      try {
        const dpr = getDpr();
        return projectToClient(paperCanvas, new paper.Point(c.x * dpr, c.y * dpr));
      } catch {
        /* fall through */
      }
    }
    if (fallbackCanvas) {
      try {
        return collabWorldToClient(fallbackCanvas, c.x, c.y, zoom, panX, panY);
      } catch {
        /* fall through */
      }
    }
    return { x: c.x, y: c.y };
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9000]"
      style={{ position: 'fixed', inset: 0 }}
      data-viewport={viewportKey}
    >
      {entries.map((c) => {
        const screen = project(c);
        return (
          <div
            key={c.userId}
            style={{
              position: 'absolute',
              left: screen.x,
              top: screen.y,
              transform: 'translate(-2px, -2px)',
              pointerEvents: 'none',
              transition: 'left 80ms linear, top 80ms linear',
            }}
          >
            <svg width="20" height="22" viewBox="0 0 20 22">
              <path
                d="M2 1 L18 11 L11 13 L8 20 Z"
                fill={c.color ?? '#3b82f6'}
                stroke="white"
                strokeWidth="1.5"
              />
            </svg>
            <div
              style={{
                marginTop: 2,
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 11,
                color: 'white',
                background: c.color ?? '#3b82f6',
                whiteSpace: 'nowrap',
                maxWidth: 140,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }}
            >
              {c.name}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CollabCursorLayer;
