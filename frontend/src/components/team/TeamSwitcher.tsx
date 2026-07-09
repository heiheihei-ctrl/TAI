import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  LogIn,
  Plus,
  User,
  Users,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { refreshTeams, useTeamStore, type TeamInfo } from '@/stores/teamStore';
import { useProjectStore } from '@/stores/projectStore';
import { projectApi } from '@/services/projectApi';
import {
  getWorkspaceProjectStorageKey,
  localizeProjectName,
  resolveWorkspaceProject,
  saveWorkspaceProjectId,
} from '@/utils/projectName';
import type { TeamSwitchProject } from './TeamSwitchConfirmModal';
import { TeamCreateModal } from './TeamCreateModal';
import { TeamJoinModal } from './TeamJoinModal';
import { TeamSwitchConfirmModal } from './TeamSwitchConfirmModal';
import { TeamManagementModal } from './TeamManagementModal';
import { TeamInviteConfirmModal } from './TeamInviteConfirmModal';
import { SHOW_TEAM_COLLABORATION } from '@/config/featureFlags';

export default function TeamSwitcher() {
  const user = useAuthStore((s) => s.user);
  const { teams, activeTeamId, setActiveTeamId } = useTeamStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [manageTeamId, setManageTeamId] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<TeamInfo | null>(null);
  const [pendingProjects, setPendingProjects] = useState<TeamSwitchProject[]>([]);
  const [pendingInitialProjectId, setPendingInitialProjectId] = useState<string | null>(null);
  const [pendingProjectLoading, setPendingProjectLoading] = useState(false);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingSwitch || pendingSwitch.isPersonal) {
      setPendingProjects([]);
      setPendingInitialProjectId(null);
      setPendingProjectLoading(false);
      return;
    }

    let cancelled = false;
    setPendingProjectLoading(true);
    setPendingProjects([]);
    setPendingInitialProjectId(null);
    const storageKey = getWorkspaceProjectStorageKey(pendingSwitch.id, false);

    void projectApi
      .list(pendingSwitch.id)
      .then((projects) => {
        if (cancelled) return;
        const target = resolveWorkspaceProject(projects, storageKey);
        setPendingProjects(
          projects.map((p) => ({
            id: p.id,
            name: localizeProjectName(p.name),
          })),
        );
        setPendingInitialProjectId(target?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setPendingProjects([]);
          setPendingInitialProjectId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPendingProjectLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pendingSwitch]);

  useEffect(() => {
    if (!SHOW_TEAM_COLLABORATION || !user) return;
    void refreshTeams().catch(() => {});
  }, [user?.id]);

  const displayName = useMemo(
    () =>
      user?.name ||
      (user?.id ? `用户-${user.id.slice(-6)}` : '用户'),
    [user?.id, user?.name],
  );

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;
  const personalTeams = teams.filter((t) => t.isPersonal);
  const sharedTeams = teams.filter((t) => !t.isPersonal);

  const applyTeamSwitch = useCallback(
    async (team: TeamInfo, projectId?: string | null) => {
      if (projectId && !team.isPersonal) {
        saveWorkspaceProjectId(
          getWorkspaceProjectStorageKey(team.id, false),
          projectId,
        );
      }
      setActiveTeamId(team.id);
      setPendingSwitch(null);
      if (projectId) {
        useProjectStore.getState().open(projectId);
      }
      await useProjectStore.getState().load();
      if (projectId) {
        useProjectStore.getState().open(projectId);
      }
    },
    [setActiveTeamId],
  );

  const handleSelectTeam = (team: TeamInfo) => {
    if (team.id === activeTeamId && !team.isPersonal) {
      setPendingSwitch(team);
      return;
    }
    if (team.id === activeTeamId) return;
    if (!team.isPersonal) {
      setPendingSwitch(team);
      return;
    }
    void applyTeamSwitch(team);
  };

  if (!SHOW_TEAM_COLLABORATION || !user) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-full border border-liquid-glass-light bg-liquid-glass-light px-2.5 text-xs text-gray-700 backdrop-blur-minimal transition-all hover:bg-liquid-glass-hover"
          >
            <User className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span className="truncate font-medium">{displayName}</span>
            <Badge
              variant="secondary"
              className={cn(
                'h-4 px-1.5 text-[10px] font-normal shrink-0',
                activeTeam?.isPersonal !== false
                  ? 'bg-sky-50 text-sky-600 hover:bg-sky-50'
                  : 'bg-teal-50 text-teal-600 hover:bg-teal-50',
              )}
            >
              {activeTeam?.isPersonal !== false ? '个人' : '团队'}
            </Badge>
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={10}
          className="w-[280px] rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur-xl"
        >
          <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium text-slate-400">
            个人账户
          </DropdownMenuLabel>
          {personalTeams.map((team) => (
            <TeamMenuItem
              key={team.id}
              team={team}
              label={displayName}
              active={team.id === activeTeamId}
              onSelect={() => handleSelectTeam(team)}
            />
          ))}

          {sharedTeams.length > 0 && (
            <>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium text-slate-400">
                团队账户
              </DropdownMenuLabel>
              {sharedTeams.map((team) => (
                <TeamMenuItem
                  key={team.id}
                  team={team}
                  label={team.name}
                  active={team.id === activeTeamId}
                  isShared
                  onSelect={() => handleSelectTeam(team)}
                  onManage={
                    team.myRole === 'owner' || team.myRole === 'admin'
                      ? () => setManageTeamId(team.id)
                      : undefined
                  }
                />
              ))}
            </>
          )}

          <DropdownMenuSeparator className="my-1" />
          {activeTeam && !activeTeam.isPersonal &&
            (activeTeam.myRole === 'owner' || activeTeam.myRole === 'admin') && (
              <DropdownMenuItem
                className="cursor-pointer rounded-xl px-3 py-2 text-sm text-slate-700"
                onClick={() => setManageTeamId(activeTeam.id)}
              >
                <Users className="mr-2 h-4 w-4" />
                管理团队
              </DropdownMenuItem>
            )}
          <DropdownMenuItem
            className="cursor-pointer rounded-xl px-3 py-2 text-sm text-slate-700"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            新建团队
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer rounded-xl px-3 py-2 text-sm text-slate-700"
            onClick={() => setJoinOpen(true)}
          >
            <LogIn className="mr-2 h-4 w-4" />
            使用邀请码加入
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {createOpen && (
        <TeamCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            await useProjectStore.getState().load();
          }}
        />
      )}

      {joinOpen && (
        <TeamJoinModal
          onClose={() => setJoinOpen(false)}
          onSubmitCode={(code) => {
            setJoinOpen(false);
            setPendingInviteCode(code);
          }}
        />
      )}

      {pendingSwitch && (
        <TeamSwitchConfirmModal
          teamName={pendingSwitch.name}
          projects={pendingProjects}
          loading={pendingProjectLoading}
          initialProjectId={pendingInitialProjectId}
          onClose={() => setPendingSwitch(null)}
          onConfirm={(projectId) => void applyTeamSwitch(pendingSwitch, projectId)}
        />
      )}

      {manageTeamId && (
        <TeamManagementModal
          teamId={manageTeamId}
          onClose={() => setManageTeamId(null)}
        />
      )}

      {pendingInviteCode && (
        <TeamInviteConfirmModal
          code={pendingInviteCode}
          onClose={() => setPendingInviteCode(null)}
          onJoined={async (teamId) => {
            setPendingInviteCode(null);
            setActiveTeamId(teamId);
            await useProjectStore.getState().load();
          }}
        />
      )}
    </>
  );
}

function TeamMenuItem({
  team,
  label,
  active,
  isShared,
  onSelect,
  onManage,
}: {
  team: TeamInfo;
  label: string;
  active: boolean;
  isShared?: boolean;
  onSelect: () => void;
  onManage?: () => void;
}) {
  return (
    <DropdownMenuItem
      className={cn(
        'cursor-pointer rounded-xl px-3 py-2.5 flex items-center gap-2',
        active && 'bg-sky-50',
      )}
      onClick={onSelect}
      onDoubleClick={(e) => {
        if (onManage) {
          e.preventDefault();
          e.stopPropagation();
          onManage();
        }
      }}
    >
      {isShared ? (
        <Users className="h-4 w-4 shrink-0 text-teal-500" />
      ) : (
        <User className="h-4 w-4 shrink-0 text-sky-500" />
      )}
      <span className="flex-1 truncate text-sm text-slate-800">{label}</span>
      {isShared && (
        <Badge className="h-4 px-1.5 text-[10px] font-normal bg-teal-50 text-teal-600 hover:bg-teal-50">
          团队
        </Badge>
      )}
      {active && <span className="h-2 w-2 rounded-full bg-sky-500 shrink-0" />}
    </DropdownMenuItem>
  );
}
