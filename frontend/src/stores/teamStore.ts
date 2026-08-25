import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { teamApi } from '@/services/teamApi';

export interface TeamInfo {
  id: string;
  name: string;
  isPersonal: boolean;
  enterpriseEnabled?: boolean;
  displayName?: string | null;
  logoUrl?: string | null;
  myRole: 'owner' | 'admin' | 'member';
  /** 当前用户在该企业是否不计席（平台派发管理员） */
  seatExempt?: boolean;
  memberCount: number;
  availableCredits: number;
}

interface TeamStore {
  teams: TeamInfo[];
  activeTeamId: string | null;
  setTeams: (teams: TeamInfo[]) => void;
  setActiveTeamId: (id: string | null) => void;
  getActiveTeam: () => TeamInfo | null;
  getPersonalTeam: () => TeamInfo | null;
  /** Patch a single team's availableCredits without reloading the whole list. */
  patchTeamCredits: (teamId: string, availableCredits: number) => void;
}

export const useTeamStore = create<TeamStore>()(
  persist(
    (set, get) => ({
      teams: [],
      activeTeamId: null,
      setTeams: (teams) => set({ teams }),
      setActiveTeamId: (id) => set({ activeTeamId: id }),
      getActiveTeam: () => get().teams.find((t) => t.id === get().activeTeamId) ?? null,
      getPersonalTeam: () => get().teams.find((t) => t.isPersonal) ?? null,
      patchTeamCredits: (teamId, availableCredits) => {
        const current = get().teams;
        const idx = current.findIndex((t) => t.id === teamId);
        if (idx < 0 || current[idx].availableCredits === availableCredits) return;
        const next = current.slice();
        next[idx] = { ...next[idx], availableCredits };
        set({ teams: next });
      },
    }),
    {
      name: 'tanva_active_team_id',
      // 持久化 teams 和 activeTeamId，确保 projectStore.load() 首次调用时
      // 就能正确判断上下文（避免 teams=[] 时误走个人路径的竞态条件）。
      partialize: (s) => ({ activeTeamId: s.activeTeamId, teams: s.teams }),
    },
  ),
);

/** 从服务端重新拉取团队列表并写入 store */
export async function refreshTeams(): Promise<TeamInfo[]> {
  const teams = await teamApi.getMyTeams();
  const store = useTeamStore.getState();
  store.setTeams(teams);
  if (!store.activeTeamId || !teams.some((t) => t.id === store.activeTeamId)) {
    const personal = teams.find((t) => t.isPersonal);
    if (personal) store.setActiveTeamId(personal.id);
  }
  return teams;
}

/** 当前工作区对应的 teamId（共享团队）或 undefined（个人） */
export function getActiveWorkspaceTeamId(): string | undefined {
  const { activeTeamId, teams } = useTeamStore.getState();
  if (!activeTeamId) return undefined;
  const team = teams.find((t) => t.id === activeTeamId);
  if (!team || team.isPersonal) return undefined;
  return team.id;
}

/**
 * 计费用 teamId：只跟当前工作区身份走。
 * 个人身份必须返回 undefined（走个人积分），禁止再回落到「当前项目的 teamId」，
 * 否则切到个人后仍可能按团队预扣，出现「团队积分不足」。
 */
export function getBillingTeamId(): string | undefined {
  return getActiveWorkspaceTeamId();
}

export function resolveCollaborationTeam(
  teams: TeamInfo[],
  activeTeamId: string | null,
  projectTeamId?: string | null,
): TeamInfo | null {
  const workspaceTeam = teams.find((t) => t.id === activeTeamId && !t.isPersonal);
  if (workspaceTeam) return workspaceTeam;
  if (!projectTeamId) return null;
  return teams.find((t) => t.id === projectTeamId && !t.isPersonal) ?? null;
}
