import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { teamCreditsApi, teamMyQuotaApi } from "@/services/teamCreditsApi";

export default function EnterpriseCreditsPage() {
  const { teamId = "" } = useParams<{ teamId: string }>();
  const [quota, setQuota] = useState<Awaited<
    ReturnType<typeof teamMyQuotaApi.getMyQuota>
  > | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!teamId) return;
    void Promise.all([
      teamMyQuotaApi.getMyQuota(teamId),
      teamCreditsApi.getAccount(teamId).catch(() => null),
    ])
      .then(([q, acc]) => {
        setQuota(q);
        setBalance(acc?.balance ?? q.teamAvailableCredits ?? null);
      })
      .catch((err: any) => setError(err?.message || "加载失败"));
  }, [teamId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">我的积分</h1>
        <p className="mt-1 text-sm text-slate-500">查看个人配额与企业额度</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
          <div className="text-xs text-slate-400">企业可用积分</div>
          <div className="mt-2 text-2xl font-semibold">
            {balance ?? quota?.teamAvailableCredits ?? "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
          <div className="text-xs text-slate-400">我的可用额度</div>
          <div className="mt-2 text-2xl font-semibold">
            {quota?.personalAvailable === null
              ? "不限（用企业额度）"
              : quota?.personalAvailable ?? "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
          <div className="text-xs text-slate-400">本周期已用</div>
          <div className="mt-2 text-2xl font-semibold">
            {quota?.creditUsedThisCycle ?? 0}
          </div>
        </div>
      </div>
    </div>
  );
}
