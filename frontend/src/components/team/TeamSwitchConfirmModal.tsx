import { createPortal } from 'react-dom';
import { FolderOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TeamSwitchProject {
  id: string;
  name: string;
}

interface Props {
  teamName: string;
  projects: TeamSwitchProject[];
  loading?: boolean;
  initialProjectId?: string | null;
  onClose: () => void;
  onConfirm: (projectId: string | null) => void;
}

export function TeamSwitchConfirmModal({
  teamName,
  projects,
  loading = false,
  initialProjectId = null,
  onClose,
  onConfirm,
}: Props) {
  const defaultProjectId =
    initialProjectId && projects.some((p) => p.id === initialProjectId)
      ? initialProjectId
      : projects[0]?.id ?? null;

  const canEnterDirectly = !loading && (projects.length === 0 || defaultProjectId);

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-3xl bg-white shadow-[0_32px_80px_rgba(15,23,42,0.18)] border border-slate-200/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">
            切换至 <span className="text-sky-600">• {teamName}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 max-h-[min(50vh,320px)] overflow-y-auto">
          {loading ? (
            <div className="py-4 text-sm text-slate-500 text-center">加载项目中…</div>
          ) : projects.length === 0 ? (
            <div className="py-4 text-sm text-slate-500 text-center">即将进入团队工作区</div>
          ) : (
            <ul className="space-y-2">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors hover:bg-slate-50"
                >
                  <FolderOpen className="w-5 h-5 shrink-0 text-sky-500" />
                  <span className="flex-1 min-w-0 text-sm font-medium text-slate-700 truncate">
                    {project.name}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                    onClick={() => onConfirm(project.id)}
                  >
                    进入
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">关闭此窗口将保留当前工作区</p>
          <button
            type="button"
            className={cn(
              'text-sm font-medium',
              canEnterDirectly
                ? 'text-sky-600 hover:text-sky-700'
                : 'text-slate-300 cursor-not-allowed',
            )}
            disabled={!canEnterDirectly}
            onClick={() => onConfirm(defaultProjectId)}
          >
            直接进入
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
