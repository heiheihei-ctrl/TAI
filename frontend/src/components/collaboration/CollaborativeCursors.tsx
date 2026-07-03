import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import paper from 'paper';
import {
  collaborationSocket,
  dedupePeersByUser,
  type CollaborationPeer,
} from '@/services/collaborationSocket';
import { clientToProject, projectToClient } from '@/utils/paperCoords';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTeamStore } from '@/stores/teamStore';
import { useCanvasStore } from '@/stores/canvasStore';

const CURSOR_THROTTLE_MS = 32;

function FigmaCursorArrow({ color }: { color: string }) {
  return (
    <svg
      width="17"
      height="21"
      viewBox="0 0 17 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="block drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
      aria-hidden
    >
      <path
        d="M1.5 1.5L1.5 17.2L6.1 13.2L9.5 20.4L11.9 19.1L8.5 11.9L14.5 11.9L1.5 1.5Z"
        fill={color}
        stroke="white"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RemoteCursor({
  peer,
  canvas,
  viewportKey,
}: {
  peer: CollaborationPeer;
  canvas: HTMLCanvasElement;
  viewportKey: string;
}) {
  if (peer.visible === false || peer.x == null || peer.y == null) {
    return null;
  }

  const point = new paper.Point(peer.x, peer.y);
  const { x, y } = projectToClient(canvas, point);

  return (
    <div
      className="pointer-events-none fixed z-[9999] will-change-transform"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${x}px, ${y}px, 0)`,
      }}
      data-viewport={viewportKey}
    >
      <div className="relative">
        <FigmaCursorArrow color={peer.color} />
        <div
          className="absolute left-[14px] top-[16px] inline-flex max-w-[180px] truncate rounded-md px-2 py-0.5 text-[11px] font-semibold leading-4 text-white shadow-[0_1px_4px_rgba(0,0,0,0.18)]"
          style={{ backgroundColor: peer.color }}
        >
          {peer.name}
        </div>
      </div>
    </div>
  );
}

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function CollaborativeCursors({ canvasRef }: Props) {
  const user = useAuthStore((s) => s.user);
  const projectId = useProjectStore((s) => s.currentProjectId);
  const panX = useCanvasStore((s) => s.panX);
  const panY = useCanvasStore((s) => s.panY);
  const zoom = useCanvasStore((s) => s.zoom);
  const [peers, setPeers] = useState<Map<string, CollaborationPeer>>(new Map());
  const [connected, setConnected] = useState(false);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const lastEmitRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number; visible: boolean } | null>(
    null,
  );

  useLayoutEffect(() => {
    setCanvasEl(canvasRef.current);
  }, [canvasRef, projectId, connected, peers.size]);

  useEffect(() => {
    if (!user || !projectId) {
      collaborationSocket.disconnect();
      setPeers(new Map());
      setConnected(false);
      return;
    }

    const activeTeam = useTeamStore.getState().teams.find(
      (t) => t.id === useTeamStore.getState().activeTeamId,
    );
    if (!activeTeam || activeTeam.isPersonal) {
      setPeers(new Map());
      setConnected(false);
      return;
    }

    let cancelled = false;
    void collaborationSocket
      .connect(projectId)
      .then(() => {
        if (!cancelled) setConnected(true);
      })
      .catch((error) => {
        console.warn('[collaboration] connect failed:', error);
        if (!cancelled) {
          setPeers(new Map());
          setConnected(false);
        }
      });

    const unsubscribe = collaborationSocket.subscribe(setPeers);
    return () => {
      cancelled = true;
      unsubscribe();
      collaborationSocket.disconnect();
      setConnected(false);
    };
  }, [user?.id, projectId]);

  useEffect(() => {
    const canvas = canvasEl;
    if (!canvas || !user || !projectId || !connected) return;

    const flush = () => {
      rafRef.current = null;
      const pending = pendingRef.current;
      if (!pending || !projectId) return;
      collaborationSocket.emitCursor(
        projectId,
        pending.x,
        pending.y,
        pending.visible,
      );
    };

    const scheduleEmit = (x: number, y: number, visible: boolean) => {
      pendingRef.current = { x, y, visible };
      const now = performance.now();
      if (now - lastEmitRef.current < CURSOR_THROTTLE_MS) {
        if (rafRef.current == null) {
          rafRef.current = window.requestAnimationFrame(flush);
        }
        return;
      }
      lastEmitRef.current = now;
      flush();
    };

    const toWorld = (clientX: number, clientY: number) => {
      const point = clientToProject(canvas, clientX, clientY);
      return { x: point.x, y: point.y };
    };

    const handleMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) return;
      const world = toWorld(event.clientX, event.clientY);
      scheduleEmit(world.x, world.y, true);
    };

    const handleLeave = () => {
      const pending = pendingRef.current;
      if (pending) {
        scheduleEmit(pending.x, pending.y, false);
      }
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    canvas.addEventListener('mouseleave', handleLeave);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseleave', handleLeave);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [canvasEl, connected, user?.id, projectId]);

  const selfPeerId = collaborationSocket.getSelfPeerId();
  const remotePeers = dedupePeersByUser(
    [...peers.values()].filter(
      (peer) =>
        peer.peerId !== selfPeerId &&
        peer.userId !== user?.id &&
        peer.visible !== false &&
        peer.x != null &&
        peer.y != null,
    ),
  );

  const viewportKey = `${panX}:${panY}:${zoom}`;

  if (!canvasEl || remotePeers.length === 0 || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <>
      {remotePeers.map((peer) => (
        <RemoteCursor
          key={peer.userId}
          peer={peer}
          canvas={canvasEl}
          viewportKey={viewportKey}
        />
      ))}
    </>,
    document.body,
  );
}
