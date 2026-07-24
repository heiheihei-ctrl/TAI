import { useEffect, useMemo, useRef } from 'react';
import { resolveCollaborationTeam, useTeamStore } from '@/stores/teamStore';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { useProjectContentStore } from '@/stores/projectContentStore';
import { realtimeClient } from '@/services/realtimeClient';
import type {
  CollabEnvelope,
  TeamCreditsChangedPayload,
  TeamProjectsChangedPayload,
} from '@/collab/types';

/** team_projects_changed 失效事件的 window 广播名：已打开的项目弹窗/管理面板据此重拉本地列表。 */
export const TEAM_PROJECTS_CHANGED_EVENT = 'team-projects-changed';
/** 当前正在编辑的项目被他人删除：携带 {projectId}，由 CurrentProjectDeletedModal 接管交互。 */
export const CURRENT_PROJECT_DELETED_EVENT = 'tanva:current-project-deleted';
const PROJECT_LIST_REFETCH_DEBOUNCE_MS = 300;

/**
 * 通过共享 WS 客户端订阅团队积分实时变更，保持本地余额同步。
 * 在 App 外壳挂载一次；activeTeamId 变化时由 realtimeClient 用新参数重连。
 */
export function useTeamRealtime(): void {
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const teams = useTeamStore((s) => s.teams);
  const projectTeamId = useProjectStore((s) => s.currentProject?.teamId);
  const collabTeamId = useMemo(
    () => resolveCollaborationTeam(teams, activeTeamId, projectTeamId)?.id ?? null,
    [teams, activeTeamId, projectTeamId],
  );
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const patchTeamCredits = useTeamStore((s) => s.patchTeamCredits);
  const projectsRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectsLastFetchAt = useRef(0);

  useEffect(() => {
    if (!collabTeamId || !userId) {
      realtimeClient.setContext({ teamId: null });
      return;
    }
    realtimeClient.setContext({ teamId: collabTeamId });

    const runProjectsRefetch = () => {
      void useProjectStore.getState().refreshList();
      try {
        window.dispatchEvent(new CustomEvent(TEAM_PROJECTS_CHANGED_EVENT));
      } catch {}
    };
    const debouncedProjectsRefetch = () => {
      const elapsed = Date.now() - projectsLastFetchAt.current;
      if (elapsed >= PROJECT_LIST_REFETCH_DEBOUNCE_MS) {
        projectsLastFetchAt.current = Date.now();
        runProjectsRefetch();
      } else if (!projectsRefetchTimer.current) {
        projectsRefetchTimer.current = setTimeout(() => {
          projectsRefetchTimer.current = null;
          projectsLastFetchAt.current = Date.now();
          runProjectsRefetch();
        }, PROJECT_LIST_REFETCH_DEBOUNCE_MS - elapsed);
      }
    };

    const unsub = realtimeClient.subscribe((env: CollabEnvelope) => {
      if (env.type === 'team_credits_changed') {
        const p = env.payload as TeamCreditsChangedPayload;
        if (!p?.teamId) return;
        patchTeamCredits(p.teamId, p.availableCredits);
        try {
          window.dispatchEvent(new CustomEvent('team-credits-changed', { detail: p }));
          window.dispatchEvent(new CustomEvent('refresh-credits'));
        } catch {}
      } else if (env.type === 'user_credits_changed') {
        try {
          window.dispatchEvent(new CustomEvent('refresh-credits'));
        } catch {}
      } else if (env.type === 'team_projects_changed') {
        const p = env.payload as TeamProjectsChangedPayload;
        if (p?.teamId && p.teamId !== collabTeamId) return;
        if (p?.action === 'deleted' && p.projectId &&
            p.projectId === useProjectStore.getState().currentProjectId) {
          try { useProjectContentStore.getState().setCacheValidationPending(true); } catch {}
          try {
            window.dispatchEvent(
              new CustomEvent(CURRENT_PROJECT_DELETED_EVENT, { detail: { projectId: p.projectId } }),
            );
          } catch {}
        }
        debouncedProjectsRefetch();
      }
    });

    return () => {
      unsub();
      if (projectsRefetchTimer.current) {
        clearTimeout(projectsRefetchTimer.current);
        projectsRefetchTimer.current = null;
      }
    };
  }, [collabTeamId, userId, patchTeamCredits]);
}
