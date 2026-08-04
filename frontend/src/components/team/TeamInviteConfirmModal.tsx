import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, X } from 'lucide-react';
import { teamApi } from '../../services/teamApi';
import { Button } from '@/components/ui/button';

interface Props {
  code: string;
  onClose: () => void;
  /** 申请已提交（等待审核），不再立刻加入 */
  onApplied: (result: { teamId: string; message?: string }) => void;
}

export function TeamInviteConfirmModal({ code, onClose, onApplied }: Props) {
  const [info, setInfo] = useState<{ teamName: string; teamId?: string } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');

  useEffect(() => {
    teamApi
      .getInviteInfo(code)
      .then(setInfo)
      .catch((e: any) => setLoadError(e?.message || '邀请链接无效或已过期'));
  }, [code]);

  const handleAgree = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await teamApi.applyInvite(code);
      setDoneMessage(result.message || '申请已提交，请等待企业管理员审核');
      onApplied({ teamId: result.teamId, message: result.message });
    } catch (e: any) {
      setSubmitError(e?.message || '提交申请失败');
      setSubmitting(false);
    }
  };

  const isLoading = !info && !loadError;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-3xl bg-white shadow-[0_32px_80px_rgba(15,23,42,0.22)] border border-slate-200/80 p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center gap-3 mb-6 pt-2">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-teal-700" />
          </div>

          {isLoading && <p className="text-sm text-slate-400">加载中…</p>}

          {loadError && (
            <p className="text-sm text-red-500">{loadError}</p>
          )}

          {doneMessage ? (
            <>
              <h2 className="text-lg font-semibold text-slate-800">申请已提交</h2>
              <p className="text-sm text-slate-500">{doneMessage}</p>
            </>
          ) : null}

          {info && !doneMessage ? (
            <>
              <h2 className="text-lg font-semibold text-slate-800">企业邀请</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                你被邀请加入企业{' '}
                <span className="font-semibold text-slate-800">「{info.teamName}」</span>
                。同意后将提交加入申请，需企业管理员审核通过后才能进入。
              </p>
            </>
          ) : null}
        </div>

        {submitError && (
          <p className="text-xs text-red-500 text-center mb-3">{submitError}</p>
        )}

        {info && !doneMessage ? (
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={onClose}>
              拒绝
            </Button>
            <Button
              className="flex-1 rounded-xl h-11 bg-teal-600 hover:bg-teal-700"
              onClick={() => void handleAgree()}
              disabled={submitting}
            >
              {submitting ? '提交中…' : '同意并申请'}
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full rounded-xl h-11" onClick={onClose}>
            关闭
          </Button>
        )}
      </div>
    </div>,
    document.body,
  );
}
