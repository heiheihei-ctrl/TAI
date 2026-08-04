import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { teamApi } from "@/services/teamApi";
import { useTeamStore } from "@/stores/teamStore";

export default function EnterpriseJoinRequestsPage() {
  const { teamId = "" } = useParams<{ teamId: string }>();
  const team = useTeamStore((s) => s.teams.find((t) => t.id === teamId));
  const canManage = team?.myRole === "owner" || team?.myRole === "admin";
  const [rows, setRows] = useState<
    Awaited<ReturnType<typeof teamApi.listJoinRequests>>
  >([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = async () => {
    if (!teamId || !canManage) return;
    const list = await teamApi.listJoinRequests(teamId);
    setRows(list);
  };

  useEffect(() => {
    if (!canManage) {
      setError("仅管理员可审核加入申请");
      return;
    }
    reload().catch((err: any) => setError(err?.message || "加载失败"));
  }, [teamId, canManage]);

  if (!canManage) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        仅企业管理员可查看加入申请
      </div>
    );
  }

  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">加入申请</h1>
        <p className="mt-1 text-sm text-slate-500">
          审核通过后申请人将成为企业成员并占用席位
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">
          待审核（{pending.length}）
        </div>
        {pending.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-400">暂无待审申请</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((row) => {
              const name =
                row.applicant.name ||
                row.applicant.phone ||
                row.applicant.email ||
                row.applicant.id.slice(0, 8);
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800">{name}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(row.createdAt).toLocaleString()}
                      {row.message ? ` · ${row.message}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={async () => {
                      setBusyId(row.id);
                      try {
                        await teamApi.approveJoinRequest(teamId, row.id);
                        await reload();
                      } catch (err: any) {
                        setError(err?.message || "通过失败");
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    同意
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={async () => {
                      setBusyId(row.id);
                      try {
                        await teamApi.rejectJoinRequest(teamId, row.id);
                        await reload();
                      } catch (err: any) {
                        setError(err?.message || "拒绝失败");
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    拒绝
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {others.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">
            历史记录
          </div>
          <ul className="divide-y divide-slate-100">
            {others.slice(0, 30).map((row) => (
              <li key={row.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span>
                  {row.applicant.name || row.applicant.phone || row.applicant.id.slice(0, 8)}
                </span>
                <span className="text-xs text-slate-400">{row.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
