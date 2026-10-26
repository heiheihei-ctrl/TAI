import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Canvas from '@/pages/Canvas';
import { CsCanvasContext } from '@/components/canvas/CsCanvasContext';
import { CsCanvasSessionBanner } from '@/components/canvas/CsCanvasSessionBanner';
import type { CsCanvasTarget } from '@/services/csDeskApi';
import PromptOptimizerDemo from '@/pages/PromptOptimizerDemo';
import Sora2Test from '@/pages/Sora2Test';
import ProjectAutosaveManager from '@/components/autosave/ProjectAutosaveManager';
import SaveDebugPanel from '@/components/autosave/SaveDebugPanel';
import { useProjectStore } from '@/stores/projectStore';
import { projectApi } from '@/services/projectApi';
import { csDeskApi } from '@/services/csDeskApi';
import { useProjectContentStore } from '@/stores/projectContentStore';
import KeyboardShortcuts from '@/components/KeyboardShortcuts';
import EventSettingsModalHost from '@/components/home/EventSettingsModalHost';
import ExportWatermarkModalHost from '@/components/export/ExportWatermarkModalHost';
import { SHOW_TEAM_COLLABORATION, SHOW_ENTERPRISE_CONSOLE } from '@/config/featureFlags';
import { TeamInviteConfirmModal } from '@/components/team/TeamInviteConfirmModal';
import { useAuthStore } from '@/stores/authStore';
import { refreshTeams, useTeamStore } from '@/stores/teamStore';
import {
  clearPendingTeamInvite,
  resolveActiveTeamInvite,
  stashPendingTeamInvite,
} from '@/utils/teamInvite';
import { AppLoadingIndicator } from '@/components/AppLoadingIndicator';
import { useTranslation } from 'react-i18next';
import Toast from '@/components/Toast';
import { useTeamRealtime } from '@/hooks/useTeamRealtime';

// 检测是否为移动设备
const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  // 检测 userAgent
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = ['android', 'iphone', 'ipad', 'ipod', 'webos', 'blackberry', 'windows phone'];
  const isMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));

  // 检测屏幕宽度（小于 768px 视为移动设备）
  const isSmallScreen = window.innerWidth < 768;

  // 检测触摸设备
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // userAgent 匹配或者（小屏幕且是触摸设备）
  return isMobileUA || (isSmallScreen && isTouchDevice);
};

// 移动设备提示组件
const MobileWarning: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center w-screen h-screen p-6 bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="max-w-md text-center">
        <div className="mb-6 text-6xl">💻</div>
        <h1 className="mb-4 text-2xl font-bold text-white">
          {t('app.mobile.title')}
        </h1>
        <p className="mb-6 leading-relaxed text-gray-300">
          {t('app.mobile.desc1')}
          <br /><br />
          {t('app.mobile.desc2')}
        </p>
        <div className="text-sm text-gray-500">
          {t('app.mobile.recommendation')}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const { t } = useTranslation();
  useTeamRealtime();
  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileDevice());
  const [showPromptDemo, setShowPromptDemo] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const search = window.location.search;
    const hash = window.location.hash;
    return search.includes('prompt-demo') || hash.includes('prompt-demo');
  });

  const [showSora2Test, setShowSora2Test] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const search = window.location.search;
    const hash = window.location.hash;
    return search.includes('sora2-test') || hash.includes('sora2-test');
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const paramProjectId = searchParams.get('projectId');
  const csConversationId = searchParams.get('csConversationId');
  const isCsEntry = searchParams.has('csConversationId');
  const [csCanvasReady, setCsCanvasReady] = useState(false);
  const [csCanvasTarget, setCsCanvasTarget] = useState<CsCanvasTarget | null>(null);
  const [csCanvasError, setCsCanvasError] = useState('');
  const [csCanvasRetry, setCsCanvasRetry] = useState(0);
  const handleCsCanvasLoadError = React.useCallback((message: string) => {
    setCsCanvasError(message);
    setCsCanvasReady(false);
  }, []);
  const paramTeamId = searchParams.get('teamId');
  const teamInviteCode = resolveActiveTeamInvite(searchParams);
  const [teamInviteOpen, setTeamInviteOpen] = useState(false);
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const projectSwitching = useProjectContentStore((state) => state.switching);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const teams = useTeamStore((s) => s.teams);

  // 获取认证状态用于显示加载指示器
  const { user, loading: authLoading } = useAuthStore();

  useEffect(() => {
    if (!isCsEntry || !user?.id) return;
    let cancelled = false;
    setCsCanvasReady(false);
    setCsCanvasError('');
    void (async () => {
      try {
        if (!csConversationId || !paramProjectId) throw new Error('缺少用户画布信息，请从客服工作台重新进入');
        const target = await csDeskApi.adminCanvasTarget(csConversationId);
        if (target.projectId !== paramProjectId) throw new Error('用户授权画布已变化，请从客服工作台重新进入');
        const project = await projectApi.get(target.projectId);
        if (cancelled) return;
        setCsCanvasTarget(target);
        useProjectContentStore.getState().beginSwitch();
        useProjectStore.setState((state) => ({
          currentProjectId: project.id, currentProject: project, modalOpen: false, error: null,
          projects: [project, ...state.projects.filter((item) => item.id !== project.id)],
        }));
        setCsCanvasReady(true);
      } catch (cause) {
        if (!cancelled) setCsCanvasError(cause instanceof Error ? cause.message : '无法进入用户画布');
      }
    })();
    return () => { cancelled = true; };
  }, [isCsEntry, csConversationId, paramProjectId, user?.id, csCanvasRetry]);

  useEffect(() => {
    if (!isCsEntry || !csCanvasReady || !csConversationId) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void csDeskApi.adminCanvasTarget(csConversationId).then((target) => {
        if (cancelled) return;
        if (target.projectId !== paramProjectId) {
          handleCsCanvasLoadError('用户授权画布已变化，请从客服工作台重新进入');
          return;
        }
        setCsCanvasTarget(target);
      }).catch((cause: unknown) => {
        if (!cancelled) handleCsCanvasLoadError(cause instanceof Error ? cause.message : '协同连接已中断');
      });
    }, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [isCsEntry, csCanvasReady, csConversationId, paramProjectId, handleCsCanvasLoadError]);

  // 记录上一次打开的项目ID，避免重复打开
  const lastOpenedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SHOW_ENTERPRISE_CONSOLE || !user || !teamInviteCode) return;
    stashPendingTeamInvite(teamInviteCode);
    setTeamInviteOpen(true);
  }, [user, teamInviteCode]);

  // 企业后台「进入创作」：按 URL teamId 切换工作区
  useEffect(() => {
    if (!paramTeamId || !user) return;
    const match = teams.find((t) => t.id === paramTeamId && !t.isPersonal);
    if (match) {
      setActiveTeamId(match.id);
      return;
    }
    void refreshTeams()
      .then((list) => {
        const found = list.find((t) => t.id === paramTeamId && !t.isPersonal);
        if (found) setActiveTeamId(found.id);
      })
      .catch(() => {});
  }, [paramTeamId, user, teams, setActiveTeamId]);

  const clearTeamInviteQuery = () => {
    clearPendingTeamInvite();
    const next = new URLSearchParams(searchParams);
    next.delete('inviteCode');
    next.delete('teamInvite');
    next.delete('team_invite');
    setSearchParams(next, { replace: true });
    setTeamInviteOpen(false);
  };


  // 监听窗口大小变化，更新移动设备状态
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setIsMobile(isMobileDevice());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const evaluate = () => {
      const search = window.location.search;
      const hash = window.location.hash;
      setShowPromptDemo(search.includes('prompt-demo') || hash.includes('prompt-demo'));
      setShowSora2Test(search.includes('sora2-test') || hash.includes('sora2-test'));
    };

    window.addEventListener('hashchange', evaluate);
    window.addEventListener('popstate', evaluate);

    return () => {
      window.removeEventListener('hashchange', evaluate);
      window.removeEventListener('popstate', evaluate);
    };
  }, []);

  useEffect(() => {
    if (isCsEntry || !paramProjectId) {
      return;
    }
    // 避免重复打开同一个项目
    if (lastOpenedProjectIdRef.current === paramProjectId) {
      return;
    }
    lastOpenedProjectIdRef.current = paramProjectId;

    // Get the openProject method directly in the effect to avoid dependency issues
    const openProjectFn = useProjectStore.getState().open;
    openProjectFn(paramProjectId);
  }, [paramProjectId, isCsEntry]);

  // 使用稳定的 projectId，优先使用 currentProjectId
  const projectId = useMemo(() => {
    // 如果 currentProjectId 存在，优先使用它（因为它是"权威"来源）
    if (currentProjectId) {
      return currentProjectId;
    }
    // 否则使用 URL 参数
    return paramProjectId;
  }, [paramProjectId, currentProjectId]);

  useEffect(() => {
    if (isCsEntry) return;
    if (!currentProjectId) {
      return;
    }
    if (paramProjectId === currentProjectId) {
      return;
    }
    const next = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    next.set('projectId', currentProjectId);
    setSearchParams(next, { replace: true });
  }, [currentProjectId, paramProjectId, setSearchParams, isCsEntry]);

  // 条件渲染放在所有 Hooks 之后
  // 移动设备优先显示提示
  if (isMobile) {
    return <MobileWarning />;
  }

  if (showPromptDemo) {
    return <PromptOptimizerDemo />;
  }

  if (showSora2Test) {
    return <Sora2Test />;
  }

  if (isCsEntry && (!csCanvasReady || currentProjectId !== paramProjectId)) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
      <div className="space-y-4 text-center">
        <p role={csCanvasError ? 'alert' : 'status'}>{csCanvasError || '正在连接用户画布…'}</p>
        {csCanvasError && <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={() => setCsCanvasRetry((value) => value + 1)}>重试</button>}
        <div><a className="text-blue-600" href="/admin">返回客服工作台</a></div>
      </div>
    </div>;
  }

  return (
    <div className="w-screen h-screen">
      <KeyboardShortcuts />
      <ProjectAutosaveManager projectId={projectId} onLoadError={isCsEntry ? handleCsCanvasLoadError : undefined} />
      <CsCanvasContext.Provider value={isCsEntry ? csCanvasTarget : null}>
        <CsCanvasSessionBanner />
        <Canvas />
      </CsCanvasContext.Provider>
      <EventSettingsModalHost />
      <ExportWatermarkModalHost />

      {SHOW_ENTERPRISE_CONSOLE && teamInviteOpen && teamInviteCode && user && (
        <TeamInviteConfirmModal
          code={teamInviteCode}
          onClose={clearTeamInviteQuery}
          onApplied={() => {
            void refreshTeams().catch(() => {});
          }}
        />
      )}

      {/* 认证初始化加载指示器 */}
      {authLoading && !user && (
        <AppLoadingIndicator message={t('app.authChecking')} />
      )}

      {/* 切换/加载项目内容 */}
      {projectSwitching && user && (
        <AppLoadingIndicator message={t('app.projectSwitching', '切换项目中...')} />
      )}

      <SaveDebugPanel />
      <Toast />
    </div>
  );
};

export default App;
