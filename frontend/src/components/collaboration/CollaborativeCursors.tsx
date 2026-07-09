import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import paper from 'paper';
import {
  collaborationSocket,
  dedupePeersByUser,
  type CollaborationPeer,
} from '@/services/collaborationSocket';
import { clientToProject, getDpr, projectToClient } from '@/utils/paperCoords';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTeamStore } from '@/stores/teamStore';
import { useCanvasStore } from '@/stores/canvasStore';
import CollaborationPresenceBar from './CollaborationPresenceBar';
import { SHOW_TEAM_COLLABORATION } from '@/config/featureFlags';

const CURSOR_THROTTLE_MS = 32;
const CURSOR_STALE_MS = 5_000;

function FigmaCursorArrow({ color }: { color: string }) {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" aria-hidden>
      <path
        d="M2 1 L18 11 L11 13 L8 20 Z"
        fill={color}
        stroke="white"
        strokeWidth="1.5"
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

  // 对端坐标是与 DPR 无关的共享画布坐标；乘回本地 dpr 再投影到屏幕（对齐 Tanva CollabCursorLayer）。
  const dpr = getDpr();
  const screen = projectToClient(canvas, new paper.Point(peer.x * dpr, peer.y * dpr));

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: screen.x,
        top: screen.y,
        transform: 'translate(-2px, -2px)',
        transition: 'left 80ms linear, top 80ms linear',
      }}
      data-viewport={viewportKey}
    >
      <FigmaCursorArrow color={peer.color} />
      <div
        className="mt-0.5 max-w-[140px] truncate rounded px-1.5 py-0.5 text-[11px] text-white shadow-sm"
        style={{ background: peer.color }}
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
  const activeTeam = useTeamStore((s) => {
    const team = s.teams.find((t) => t.id === s.activeTeamId);
    return team && !team.isPersonal ? team : null;
  });
  const viewportKey = useCanvasStore((s) => `${s.zoom}:${s.panX}:${s.panY}`);

  const [peers, setPeers] = useState<Map<string, CollaborationPeer>>(new Map());
  const [connected, setConnected] = useState(false);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const lastEmitRef = useRef(0);
  const lastCursorRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);

  const isTeamProject = !!activeTeam;

  const refreshConnected = () => {
    if (!projectId || !isTeamProject) {
      setConnected(false);
      return;
    }
    setConnected(collaborationSocket.isReadyForProject(projectId));
  };

  useLayoutEffect(() => {
    setCanvasEl(
      (paper?.view?.element as HTMLCanvasElement | undefined) ?? canvasRef.current,
    );
  }, [canvasRef, projectId, connected, peers.size, viewportKey]);

  useEffect(() => {
    if (!user || !projectId || !isTeamProject) {
      setPeers(new Map());
      setConnected(false);
      return;
    }

    let cancelled = false;

    void collaborationSocket.ensureProject(projectId).finally(() => {
      if (!cancelled) {
        refreshConnected();
      }
    });

    const unsubPeers = collaborationSocket.subscribePeers(setPeers);
    const unsubConn = collaborationSocket.subscribeConnection(
      ({ connected: ok, projectId: activeProjectId }) => {
        if (!cancelled) {
          setConnected(
            ok && activeProjectId === projectId && isTeamProject,
          );
        }
      },
    );

    return () => {
      cancelled = true;
      unsubPeers();
      unsubConn();
    };
  }, [user?.id, projectId, isTeamProject]);

  // 定期清理过期光标（Tanva usePresence 同款 5s 过期）
  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, [connected]);

  // pointermove → 共享画布坐标 → 广播（对齐 Tanva CollabRoot：不等待 connected，join 期间缓存光标）
  useEffect(() => {
    if (!canvasEl || !user || !projectId || !isTeamProject) return;

    const flush = () => {
      rafRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending || !projectId) return;

      const canvas =
        (paper?.view?.element as HTMLCanvasElement | undefined) ?? canvasEl;
      if (!canvas || !paper?.view) return;

      const p = clientToProject(canvas, pending.x, pending.y);
      const dpr = getDpr();
      const now = performance.now();
      if (now - lastEmitRef.current < CURSOR_THROTTLE_MS) return;
      lastEmitRef.current = now;
      const cursor = { x: p.x / dpr, y: p.y / dpr };
      lastCursorRef.current = cursor;
      collaborationSocket.emitCursor(projectId, cursor.x, cursor.y, true);
    };

    const handler = (e: PointerEvent) => {
      pendingRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current == null) {
        rafRef.current = window.requestAnimationFrame(flush);
      }
    };

    window.addEventListener('pointermove', handler, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handler);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [canvasEl, user?.id, projectId, isTeamProject]);

  // 切换项目后加入新房间时，立即补发一次光标位置
  useEffect(() => {
    if (!connected || !projectId || !isTeamProject) return;
    const last = lastCursorRef.current;
    if (!last) return;
    collaborationSocket.emitCursor(projectId, last.x, last.y, true);
  }, [connected, projectId, isTeamProject]);

  const selfPeerId = collaborationSocket.getSelfPeerId();
  const selfUserId = user?.id ?? collaborationSocket.getSelfUserId();

  const allPeersForPresence = useMemo(
    () =>
      dedupePeersByUser(
        [...peers.values()].filter((peer) => peer.visible !== false),
      ),
    [peers],
  );

  const remotePeers = useMemo(
    () =>
      dedupePeersByUser(
        [...peers.values()].filter((peer) => {
          if (peer.peerId === selfPeerId) return false;
          if (peer.userId === selfUserId) return false;
          if (peer.visible === false) return false;
          if (peer.x == null || peer.y == null) return false;
          const seen = peer.lastSeen ?? 0;
          if (seen > 0 && now - seen > CURSOR_STALE_MS) return false;
          return true;
        }),
      ),
    [peers, selfPeerId, selfUserId, now],
  );

  const showCollaboration =
    SHOW_TEAM_COLLABORATION &&
    isTeamProject &&
    !!projectId &&
    (connected || peers.size > 0 || collaborationSocket.isConnected());

  if (!showCollaboration) {
    return null;
  }

  return (
    <>
      <CollaborationPresenceBar peers={allPeersForPresence} currentUserId={selfUserId} />
      {canvasEl && remotePeers.length > 0 && (
        <div
          className="pointer-events-none fixed inset-0 z-[9000]"
          data-viewport={viewportKey}
        >
          {remotePeers.map((peer) => (
            <RemoteCursor
              key={peer.userId}
              peer={peer}
              canvas={canvasEl}
              viewportKey={viewportKey}
            />
          ))}
        </div>
      )}
    </>
  );
}
