import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, X } from 'lucide-react';
import { parseTeamInviteCode } from '@/utils/teamInvite';
import { teamApi } from '@/services/teamApi';
import { Button } from '@/components/ui/button';

interface Props {
  onClose: () => void;
}

/** 画布侧：输入企业邀请码并提交加入申请 */
export function EnterpriseJoinCodeModal({ onClose }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = parseTeamInviteCode(value) || value.trim();
    if (!code || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await teamApi.joinByCode(code);
      setSuccess(result.message || '申请已提交，请等待企业管理员审核');
    } catch (err: any) {
      setError(err?.message || '提交失败');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-3xl bg-white shadow-[0_32px_80px_rgba(15,23,42,0.22)] border border-slate-200/80 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50">
            <Building2 className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">输入企业邀请码</h3>
            <p className="text-xs text-slate-400">提交后需企业管理员同意才能加入</p>
          </div>
        </div>

        {success ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-teal-50 px-3 py-3 text-sm text-teal-800">{success}</p>
            <Button className="w-full rounded-xl" onClick={onClose}>
              完成
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="粘贴邀请码或邀请链接"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
              autoFocus
            />
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            <Button
              type="submit"
              className="w-full rounded-xl bg-teal-600 hover:bg-teal-700"
              disabled={busy || !value.trim()}
            >
              {busy ? '提交中…' : '提交申请'}
            </Button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
