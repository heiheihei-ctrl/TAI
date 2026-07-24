import React, { useCallback, useEffect, useRef } from 'react';
import paper from 'paper';
import { clientToProject, clientToCollabWorld, getDpr } from '@/utils/paperCoords';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';
import { useCanvasStore } from '@/stores';
import { useCollab } from '@/collab/CollabContext';
import { usePresence } from '@/hooks/usePresence';
import { useTaskBroadcast } from '@/hooks/useTaskBroadcast';
import { useCollabToast } from '@/hooks/useCollabToast';
import { useTeamPresenceProfiles } from '@/hooks/useTeamPresenceProfiles';
import CollabCursorLayer from './CollabCursorLayer';
import CollabPresenceBar from './CollabPresenceBar';
import CollabToastHost, { type CollabToastApi } from './CollabToastHost';
import type { ToastKind } from '@/collab/types';

/**
 * Top-level wiring for canvas real-time collaboration. Mounted once inside
 * the Canvas page; spins up the SSE connection, listens for presence/
 * cursor/task/toast events, and renders the overlay UI.
 *
 * The hook returns expose `sendPatch` / `claimLock` / `releaseLock` for
 * downstream Paper.js layers to consume — those wirings are intentionally
 * left for a follow-up so this PR stays focused on transport + UI bones.
 */
const CollabRoot: React.FC = () => {
  const projectId = useProjectStore((s) => s.currentProjectId);
  const user = useAuthStore((s) => s.user);
  const currentUserId = user?.id ?? null;
  const activeTeam = useTeamStore((s) => s.getActiveTeam());

  const toastApiRef = useRef<CollabToastApi | null>(null);
  const setToastApi = useCallback((api: CollabToastApi) => {
    toastApiRef.current = api;
  }, []);

  // access_revoked / snapshot_required 由 CollabProvider 经 window 事件转发到此处展示提示。
  useEffect(() => {
    const onRevoked = () =>
      toastApiRef.current?.show('您对此项目的访问权限已被撤销', 'info');
    // 补帧失败(缺帧过多)：本地状态已与服务端发散，拉取全量快照恢复。
    // 此为长时间断线后的兜底场景，整页重载可确保干净地获取最新全量项目。
    let snapshotReloadTimer: ReturnType<typeof setTimeout> | null = null;
    const onSnapshot = () => {
      toastApiRef.current?.show('远程变更过多，正在拉取最新全量内容…', 'info');
      if (snapshotReloadTimer) return; // 防重复
      snapshotReloadTimer = setTimeout(() => {
        try { window.location.reload(); } catch {}
      }, 1500);
    };
    window.addEventListener('collab:access-revoked', onRevoked);
    window.addEventListener('collab:snapshot-required', onSnapshot);
    return () => {
      window.removeEventListener('collab:access-revoked', onRevoked);
      window.removeEventListener('collab:snapshot-required', onSnapshot);
      if (snapshotReloadTimer) clearTimeout(snapshotReloadTimer);
    };
  }, []);

  // Always call the hook with a placeholder when no project; React rules.
  // 协作句柄由顶层 CollabProvider 提供（与 FlowOverlay 共享同一连接）。
  const collab = useCollab();
  const presence = usePresence(collab ?? undefined);
  const teamPresenceProfiles = useTeamPresenceProfiles();

  const showToast = useCallback((text: string, kind: ToastKind) => {
    toastApiRef.current?.show(text, kind);
  }, []);

  useCollabToast(collab, {
    show: showToast,
    ignoreOwn: true,
    currentUserId,
  });

  useTaskBroadcast(collab, {
    onTaskStatus: (entry) => {
      if (entry.status === 'succeeded') {
        toastApiRef.current?.show(
          `任务完成：${entry.taskType}${entry.nodeId ? ` (#${entry.nodeId.slice(0, 6)})` : ''}`,
          'generate',
        );
      } else if (entry.status === 'failed') {
        toastApiRef.current?.show(
          `任务失败：${entry.taskType}${entry.error ? ` - ${entry.error.slice(0, 60)}` : ''}`,
          'generate',
        );
      }
    },
  });

  // pointer-move → 换算为画布世界坐标后发布光标。
  // 用 pointermove + rAF；Paper 未就绪时回退到 canvasStore 视口换算，避免永远不发光标。
  useEffect(() => {
    if (!projectId) return;
    let rafId: number | null = null;
    let pending: { x: number; y: number } | null = null;
    const flush = () => {
      rafId = null;
      const next = pending;
      pending = null;
      if (!next || !collab) return;

      const paperCanvas = (paper?.view?.element as HTMLCanvasElement | undefined) ?? null;
      if (paperCanvas && paper?.view) {
        try {
          const p = clientToProject(paperCanvas, next.x, next.y);
          const dpr = getDpr();
          collab.sendCursor(p.x / dpr, p.y / dpr);
          return;
        } catch {
          /* fall through */
        }
      }

      // Paper 未就绪：用与旧 CollaborativeCursors 相同的 CSS 逻辑世界坐标。
      const el =
        (document.querySelector('canvas.tanva-main-canvas') as HTMLCanvasElement | null) ??
        null;
      if (!el) return;
      const { zoom, panX, panY } = useCanvasStore.getState();
      const cursor = clientToCollabWorld(el, next.x, next.y, zoom, panX, panY);
      collab.sendCursor(cursor.x, cursor.y);
    };
    const handler = (e: PointerEvent) => {
      pending = { x: e.clientX, y: e.clientY };
      if (rafId == null) rafId = window.requestAnimationFrame(flush);
    };
    window.addEventListener('pointermove', handler, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handler);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [projectId, collab]);

  if (!projectId) {
    return <CollabToastHost apiRef={setToastApi} />;
  }

  return (
    <>
      <CollabCursorLayer cursors={presence.cursors} />
      {!activeTeam?.isPersonal && (
        <CollabPresenceBar
          online={presence.online}
          currentUserId={currentUserId}
          fallbackUser={user ?? null}
          profilesByUserId={teamPresenceProfiles}
        />
      )}
      <CollabToastHost apiRef={setToastApi} />
    </>
  );
};

export default CollabRoot;
