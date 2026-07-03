import { createPortal } from 'react-dom';
import { FolderOpen, X } from 'lucide-react';

interface Props {
  teamName: string;
  projectName?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function TeamSwitchConfirmModal({
  teamName,
  projectName,
  onClose,
  onConfirm,
}: Props) {
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
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {projectName ? (
          <div className="px-6 py-8 flex items-center gap-3 text-slate-600">
            <FolderOpen className="w-5 h-5 text-slate-400 shrink-0" />
            <span className="text-sm font-medium truncate">{projectName}</span>
          </div>
        ) : (
          <div className="px-6 py-8 text-sm text-slate-500">即将进入团队工作区</div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">关闭此窗口将保留当前工作区</p>
          <button
            type="button"
            className="text-sm font-medium text-sky-600 hover:text-sky-700"
            onClick={onConfirm}
          >
            直接进入
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
