import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTeamStore } from '../../stores/teamStore';
import { useAuthStore } from '../../stores/authStore';
import { useProjectStore } from '../../stores/projectStore';
import { projectApi, type Project } from '../../services/projectApi';
import { TEAM_PROJECTS_CHANGED_EVENT } from '../../hooks/useTeamRealtime';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, X, FolderOpen, Loader2, User, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHOW_TEAM_COLLABORATION, SHOW_ENTERPRISE_CONSOLE } from '@/config/featureFlags';

// 工作区切换：企业控制台开启时也要能切回个人版；实时协同仍由 SHOW_TEAM_COLLABORATION 控制。
const TEAM_UI_ENABLED =
  SHOW_TEAM_COLLABORATION ||
  SHOW_ENTERPRISE_CONSOLE ||
  ['1', 'true', 'on', 'yes'].includes(
    String(import.meta.env.VITE_ENABLE_TEAM ?? '').toLowerCase(),
  );

interface Props {
  variant?: 'header' | 'home';
  className?: string;
}

function TeamProjectPickerModal({
  teamId,
  teamName,
  isPersonal,
  onConfirm,
  onCancel,
}: {
  teamId: string;
  teamName: string;
  isPersonal?: boolean;
  onConfirm: (projectId?: string) => void;
  onCancel: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    (withSpinner: boolean) => {
      if (withSpinner) setLoading(true);
      try {
        const fetchFn = isPersonal ? projectApi.list() : projectApi.listByTeam(teamId);
        fetchFn
          .then(setProjects)
          .catch(() => { if (withSpinner) setProjects([]); })
          .finally(() => { if (withSpinner) setLoading(false); });
      } catch {
        if (withSpinner) {
          setProjects([]);
          setLoading(false);
        }
      }
    },
    [teamId, isPersonal],
  );

  useEffect(() => {
    reload(true);
  }, [reload]);

  // 实时同步：他人新建/删除团队项目时静默重拉（个人 tab 不订阅团队事件，团队 tab 才刷新）。
  useEffect(() => {
    if (isPersonal) return;
    const onTeamProjectsChanged = () => reload(false);
    window.addEventListener(TEAM_PROJECTS_CHANGED_EVENT, onTeamProjectsChanged);
    return () => window.removeEventListener(TEAM_PROJECTS_CHANGED_EVENT, onTeamProjectsChanged);
  }, [isPersonal, reload]);

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.18)] border border-slate-200 p-5 w-96 max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="text-sm font-semibold text-slate-800">
            切换至 · <span className={isPersonal ? 'text-blue-500' : 'text-blue-600'}>{teamName}</span>
          </h3>
          <button
            onClick={onCancel}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-sm">加载中…</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400">暂无项目</div>
          ) : (
            <div className="space-y-0.5">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onConfirm(p.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left hover:bg-slate-50 transition-colors group"
                >
                  <FolderOpen className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-blue-500 transition-colors" />
                  <span className="text-sm text-slate-700 truncate flex-1">{p.name}</span>
                  <span className="text-xs text-slate-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">进入</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 shrink-0 flex items-center justify-between">
          <p className="text-xs text-slate-400">关闭此窗口将保留当前工作区</p>
          {!loading && (
            <button
              onClick={() => onConfirm(undefined)}
              className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
            >
              直接进入
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function TeamSwitcher({ variant = 'header', className }: Props) {
  const { teams, activeTeamId, setActiveTeamId } = useTeamStore();
  const user = useAuthStore((s) => s.user);
  const projectStore = useProjectStore();
  const [teamPickerTarget, setTeamPickerTarget] = useState<{ id: string; name: string; isPersonal?: boolean } | null>(null);

  const personalTeam = teams.find((t) => t.isPersonal);
  const orgTeams = teams.filter(
    (t) => !t.isPersonal && (SHOW_ENTERPRISE_CONSOLE ? t.enterpriseEnabled !== false : true),
  );
  const activeTeam = teams.find((t) => t.id === activeTeamId);
  // teams 未加载时不要把「有 activeTeamId 但找不到团队」误判成个人
  const isPersonalActive = activeTeam
    ? activeTeam.isPersonal
    : !activeTeamId;

  const displayName = (() => {
    if (!activeTeam || activeTeam.isPersonal) {
      const name = (user as any)?.name || (user as any)?.phone || '个人';
      return name.length > 10 ? name.slice(0, 10) + '…' : name;
    }
    return activeTeam.name.length > 10 ? activeTeam.name.slice(0, 10) + '…' : activeTeam.name;
  })();

  const completeSwitchTeam = (teamId: string, projectId?: string) => {
    const target = teams.find((t) => t.id === teamId);
    const switchingToPersonal = !target || !!target.isPersonal;
    setActiveTeamId(teamId || personalTeam?.id || null);
    // 切到个人时立刻清掉团队项目上下文，避免 load 完成前仍按团队预扣积分
    if (switchingToPersonal && projectStore.currentProject?.teamId) {
      useProjectStore.setState({
        currentProjectId: null,
        currentProject: null,
      });
    }
    window.dispatchEvent(new Event('refresh-credits'));
    setTimeout(() => {
      void projectStore.load().then(() => {
        if (projectId) projectStore.open(projectId);
      });
    }, 80);
  };

  const openPicker = (teamId: string, name: string, isPersonal: boolean) => {
    // setTimeout(0) 确保 DropdownMenu 的 dismiss 事件先完成，避免 backdrop onClick 立即触发 onCancel
    setTimeout(() => {
      setTeamPickerTarget({ id: teamId, name, isPersonal });
    }, 0);
  };

  const switchTeam = (teamId: string) => {
    if (teamId === activeTeamId) return;
    const target = teams.find((t) => t.id === teamId);
    if (!target) return;

    const name = target.isPersonal
      ? ((user as any)?.name || (user as any)?.phone || '个人工作区')
      : target.name;
    openPicker(teamId, name, !!target.isPersonal);
  };

  const switchToPersonal = () => {
    const personal = teams.find((t) => t.isPersonal);
    const name = (user as any)?.name || (user as any)?.phone || '个人工作区';
    // 即使已在个人模式，也允许弹出项目选择（方便切换项目）。
    // personal 缺失时（团队列表尚未加载）传空 id，模态框的个人分支只用 projectApi.list()。
    openPicker(personal?.id ?? '', name, true);
  };

  const handleTeamPickerConfirm = (projectId?: string) => {
    if (!teamPickerTarget) return;
    completeSwitchTeam(teamPickerTarget.id, projectId);
    setTeamPickerTarget(null);
  };

  // 团队功能前端展示开关：默认隐藏（VITE_ENABLE_TEAM 未开启时不渲染）。
  if (!TEAM_UI_ENABLED || !user) return null;

  const triggerClass =
    variant === 'header'
      ? cn(
          'h-7 px-2 text-xs rounded-full border backdrop-blur-minimal transition-all duration-200 flex items-center gap-1 max-w-[140px]',
          isPersonalActive
            ? 'border-liquid-glass-light bg-liquid-glass-light text-gray-700 hover:bg-liquid-glass-hover'
            : 'border-teal-200/70 bg-teal-50/60 text-teal-800 hover:bg-teal-100/80',
          className,
        )
      : cn(
          'flex items-center gap-1.5 text-sm text-white/90 hover:text-white transition-colors bg-transparent border-none shadow-none p-0 h-auto',
          className,
        );

  const userName = (user as any)?.name || (user as any)?.phone || '个人账户';

  const menuContent = (
    <DropdownMenuContent
      align="end"
      sideOffset={8}
      className="w-60 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_12px_28px_rgba(15,23,42,0.12)] p-1.5"
    >
      {/* 个人账户 */}
      <DropdownMenuLabel className="px-3 py-1 text-[10px] text-slate-400 font-normal uppercase tracking-wide">
        个人账户
      </DropdownMenuLabel>
      <DropdownMenuItem
        onClick={switchToPersonal}
        className={cn(
          'rounded-xl px-3 py-2 cursor-pointer text-sm flex items-center gap-2',
          isPersonalActive ? 'bg-slate-100' : '',
        )}
      >
        <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <User className="w-3 h-3 text-blue-600" />
        </div>
        <span className="flex-1 truncate">{userName}</span>
        <span className="text-[10px] text-slate-400 shrink-0">个人</span>
        {isPersonalActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
        )}
      </DropdownMenuItem>

      {/* 团队账户 */}
      {orgTeams.length > 0 && (
        <>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuLabel className="px-3 py-1 text-[10px] text-slate-400 font-normal uppercase tracking-wide">
            {SHOW_ENTERPRISE_CONSOLE ? '企业账户' : '团队账户'}
          </DropdownMenuLabel>
          {orgTeams.map((team) => (
            <DropdownMenuItem
              key={team.id}
              onClick={() => switchTeam(team.id)}
              className={cn(
                'rounded-xl px-3 py-2 cursor-pointer text-sm flex items-center gap-2',
                team.id === activeTeamId ? 'bg-teal-50' : '',
              )}
            >
              <div className="w-5 h-5 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
                <Building2 className="w-3 h-3 text-teal-600" />
              </div>
              <span className="flex-1 truncate">{team.name}</span>
              <span className="text-[10px] font-medium text-teal-600 bg-teal-100 rounded-full px-1.5 py-0.5 leading-none shrink-0">团队</span>
              {team.id === activeTeamId && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
        </>
      )}
    </DropdownMenuContent>
  );

  return (
    <>
      {teamPickerTarget && (
        <TeamProjectPickerModal
          teamId={teamPickerTarget.id}
          teamName={teamPickerTarget.name}
          isPersonal={teamPickerTarget.isPersonal}
          onConfirm={handleTeamPickerConfirm}
          onCancel={() => setTeamPickerTarget(null)}
        />
      )}

      {variant === 'header' ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={triggerClass}>
              {isPersonalActive
                ? <User className="w-3 h-3 shrink-0" />
                : <Building2 className="w-3 h-3 shrink-0 text-teal-600" />
              }
              <span className="truncate">{displayName}</span>
              {isPersonalActive
                ? <span className="text-[10px] text-gray-400 shrink-0">个人</span>
                : <span className="text-[10px] font-medium text-teal-600 bg-teal-100 rounded-full px-1 py-0.5 leading-none shrink-0">{SHOW_ENTERPRISE_CONSOLE ? '企业' : '团队'}</span>
              }
              <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          {menuContent}
        </DropdownMenu>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger className={triggerClass}>
            {isPersonalActive
              ? <User className="w-3.5 h-3.5" />
              : <Building2 className="w-3.5 h-3.5" />
            }
            <span>{displayName}</span>
            {isPersonalActive
              ? <span className="text-xs text-white/60">个人</span>
              : <span className="text-xs text-white/60">团队</span>
            }
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          </DropdownMenuTrigger>
          {menuContent}
        </DropdownMenu>
      )}
    </>
  );
}
