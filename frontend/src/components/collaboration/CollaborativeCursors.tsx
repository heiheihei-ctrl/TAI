import { useEffect, useRef, useState } from 'react';
import paper from 'paper';
import {
  collaborationSocket,
  type CollaborationPeer,
} from '@/services/collaborationSocket';
import { clientToProject, projectToClient } from '@/utils/paperCoords';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';

const CURSOR_THROTTLE_MS = 40;

function CursorArrow({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="20"
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-sm"
    >
      <path
        d="M1 1L1 16.5L5.2 12.8L8.4 19.5L10.6 18.4L7.4 11.7L13 11.7L1 1Z"
        fill={color}
        stroke="white"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RemoteCursor({
  peer,
  canvas,
}: {
  peer: CollaborationPeer;
  canvas: HTMLCanvasElement;
}) {
  if (peer.visible === false || peer.x == null || peer.y == null) {
    return null;
  }

  const point = new paper.Point(peer.x, peer.y);
  const { x, y } = projectToClient(canvas, point);

  return (
    <div
      className="pointer-events-none fixed z-[950] will-change-transform"
      style={{
        left: 0,
        top: 0,
        transform: `translate(${x}px, ${y}px)`,
      }}
    >
      <CursorArrow color={peer.color} />
      <div
        className="ml-3 -mt-1 inline-flex max-w-[160px] truncate rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow-md"
        style={{ backgroundColor: peer.color }}
      >
        {peer.name}
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
  const [peers, setPeers] = useState<Map<string, CollaborationPeer>>(new Map());
  const lastEmitRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number; visible: boolean } | null>(
    null,
  );

  useEffect(() => {
    if (!user || !projectId) {
      collaborationSocket.disconnect();
      setPeers(new Map());
      return;
    }

    let cancelled = false;
    void collaborationSocket.connect(projectId).catch(() => {
      if (!cancelled) setPeers(new Map());
    });

    const unsubscribe = collaborationSocket.subscribe(setPeers);
    return () => {
      cancelled = true;
      unsubscribe();
      collaborationSocket.disconnect();
    };
  }, [user?.id, projectId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !user || !projectId) return;

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
      const world = toWorld(event.clientX, event.clientY);
      scheduleEmit(world.x, world.y, true);
    };

    const handleLeave = () => {
      const pending = pendingRef.current;
      if (pending) {
        scheduleEmit(pending.x, pending.y, false);
      }
    };

    window.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseleave', handleLeave);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseleave', handleLeave);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [canvasRef, user?.id, projectId]);

  const canvas = canvasRef.current;
  const remotePeers = [...peers.values()].filter((peer) => peer.userId !== user?.id);
  if (!canvas || remotePeers.length === 0) return null;

  return (
    <>
      {remotePeers.map((peer) => (
        <RemoteCursor key={peer.peerId} peer={peer} canvas={canvas} />
      ))}
    </>
  );
}
