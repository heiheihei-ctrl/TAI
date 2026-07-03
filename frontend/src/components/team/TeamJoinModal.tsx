import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { parseTeamInviteCode } from '@/utils/teamInvite';
import { Button } from '@/components/ui/button';

interface Props {
  onClose: () => void;
  onSubmitCode: (code: string) => void;
}

export function TeamJoinModal({ onClose, onSubmitCode }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleJoin = () => {
    const code = parseTeamInviteCode(input);
    if (!code) {
      setError('请输入有效的邀请码或链接');
      return;
    }
    onSubmitCode(code);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm mx-4 rounded-3xl bg-white shadow-[0_32px_80px_rgba(15,23,42,0.18)] border border-slate-200/80 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-base font-semibold text-slate-800 mb-4">使用邀请码加入</h2>

        <input
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError('');
          }}
          placeholder="粘贴邀请码或链接"
          className="w-full rounded-xl border border-sky-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleJoin();
          }}
        />

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-6 flex items-center gap-3">
          <Button
            className="flex-1 rounded-full bg-slate-800 hover:bg-slate-900"
            onClick={handleJoin}
          >
            加入
          </Button>
          <button
            type="button"
            className="text-sm text-slate-600 hover:text-slate-900 px-2"
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
