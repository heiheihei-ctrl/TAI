import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { collaborationSocket, dedupeByUserId } from '@/services/collaborationSocket';
import type { CollaborationSelectionState } from '@/services/collaborationSocket';
import {
  applyRemoteContentUpdate,
  resetCollaborationContentState,
} from '@/services/collaborationContentApply';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTeamStore } from '@/stores/teamStore';
import RemoteSelectionOverlays from './RemoteSelectionOverlays';
import { SHOW_TEAM_COLLABORATION } from '@/config/featureFlags';

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function CollaborationSyncManager({ canvasRef }: Props) {
  const user = useAuthStore((s) => s.user);
  const projectId = useProjectStore((s) => s.currentProjectId);
  const activeTeam = useTeamStore((s) => {
    const team = s.teams.find((t) => t.id === s.activeTeamId);
    return team && !team.isPersonal ? team : null;
  });
  const [connected, setConnected] = useState(false);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [remoteSelections, setRemoteSelections] = useState<
    CollaborationSelectionState[]
  >([]);
  const contentPullTimerRef = useRef<number | null>(null);

  const isTeamProject = !!activeTeam;

  useLayoutEffect(() => {
    setCanvasEl(canvasRef.current);
  }, [canvasRef, projectId, connected]);

  // 团队会话：对齐 Tanva useTeamRealtime，仅在离开团队模式时断连
  useEffect(() => {
    if (!user || !isTeamProject) return;
    return () => {
      collaborationSocket.disconnect();
    };
  }, [user?.id, isTeamProject]);

  // 项目房间：切换项目只 join 新 room，不 hardDisconnect（对齐 Tanva setContext projectId）
  useEffect(() => {
    if (!user || !projectId || !isTeamProject) {
      setConnected(false);
      setRemoteSelections([]);
      resetCollaborationContentState();
      return;
    }

    let cancelled = false;

    const refreshConnected = () => {
      if (cancelled) return;
      setConnected(collaborationSocket.isReadyForProject(projectId));
    };

    void collaborationSocket
      .connect(projectId)
      .then(refreshConnected)
      .catch((error) => {
        console.warn('[collaboration] sync connect failed:', error);
        if (!cancelled) setConnected(false);
      });

    const unsubConn = collaborationSocket.subscribeConnection(
      ({ connected: ok, projectId: activeProjectId }) => {
        if (!cancelled) {
          setConnected(ok && activeProjectId === projectId);
        }
      },
    );

    const unsubSelections = collaborationSocket.subscribeSelections((map) => {
      const selfUserId = collaborationSocket.getSelfUserId();
      setRemoteSelections(
        dedupeByUserId(
          [...map.values()].filter((item) => item.userId !== selfUserId),
        ),
      );
    });

    const unsubContent = collaborationSocket.subscribeContentUpdates((payload) => {
      if (contentPullTimerRef.current != null) {
        window.clearTimeout(contentPullTimerRef.current);
      }
      contentPullTimerRef.current = window.setTimeout(() => {
        contentPullTimerRef.current = null;
        void applyRemoteContentUpdate(payload);
      }, 300);
    });

    return () => {
      cancelled = true;
      unsubConn();
      unsubSelections();
      unsubContent();
      if (contentPullTimerRef.current != null) {
        window.clearTimeout(contentPullTimerRef.current);
      }
    };
  }, [user?.id, projectId, isTeamProject]);

  // 视口：与 Figma 一致，各用户独立 pan/zoom，不做自动跟随（避免两人同时拖动画布时视口互相覆盖、方向相反）

  useEffect(() => {
    if (!connected || !projectId || !isTeamProject) return;
    if (!collaborationSocket.isReadyForProject(projectId)) return;

    const handleSelectionUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        imageIds?: string[];
        modelIds?: string[];
        videoIds?: string[];
        textIds?: string[];
        pathBounds?: Array<{ x: number; y: number; width: number; height: number }>;
        marqueeBounds?: { x: number; y: number; width: number; height: number } | null;
      } | undefined;
      if (!detail) return;

      collaborationSocket.emitSelection(projectId, {
        imageIds: detail.imageIds ?? [],
        modelIds: detail.modelIds ?? [],
        videoIds: detail.videoIds ?? [],
        textIds: detail.textIds ?? [],
        pathBounds: detail.pathBounds ?? [],
        marqueeBounds: detail.marqueeBounds ?? null,
      });
    };

    window.addEventListener(
      'tanva-canvas-selection-updated',
      handleSelectionUpdated as EventListener,
    );
    return () => {
      window.removeEventListener(
        'tanva-canvas-selection-updated',
        handleSelectionUpdated as EventListener,
      );
    };
  }, [connected, projectId, isTeamProject]);

  if (!SHOW_TEAM_COLLABORATION) {
    return null;
  }

  return (
    <RemoteSelectionOverlays canvas={canvasEl} selections={remoteSelections} />
  );
}
