import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { teamApi, type TeamMember } from "@/services/teamApi";
import { teamCreditsApi, teamMyQuotaApi } from "@/services/teamCreditsApi";
import { refreshTeams, useTeamStore } from "@/stores/teamStore";
import { TeamManagementModal } from "@/components/team/TeamManagementModal";

export default function EnterpriseSettingsPage() {
  const { teamId = "" } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const team = useTeamStore((s) => s.teams.find((t) => t.id === teamId));
  const myRole = team?.myRole;
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  useEffect(() => {
    if (team && !canManage) {
      navigate(`/enterprise/${teamId}`, { replace: true });
    }
  }, [team, canManage, navigate, teamId]);

  const [name, setName] = useState(team?.name || "");
  const [displayName, setDisplayName] = useState(team?.displayName || team?.name || "");
  const [logoUrl, setLogoUrl] = useState(team?.logoUrl || "");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [transferTo, setTransferTo] = useState("");
  const [credits, setCredits] = useState(0);
  const [quota, setQuota] = useState<Awaited<
    ReturnType<typeof teamMyQuotaApi.getMyQuota>
  > | null>(null);
  const [ledger, setLedger] = useState<
    Awaited<ReturnType<typeof teamCreditsApi.getLedger>>
  >([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalTab, setModalTab] = useState<"subscription" | "topup" | null>(null);

  useEffect(() => {
    setName(team?.name || "");
    setDisplayName(team?.displayName || team?.name || "");
    setLogoUrl(team?.logoUrl || "");
  }, [team]);

  useEffect(() => {
    if (!teamId) return;
    void Promise.all([
      teamApi.getMembers(teamId).then(setMembers),
      teamCreditsApi.getAccount(teamId).then((a) => setCredits(a.balance ?? 0)),
      teamMyQuotaApi.getMyQuota(teamId).catch(() => null),
      teamCreditsApi.getLedger(teamId, 20, 0).then(setLedger).catch(() => []),
    ])
      .then(([, , q]) => setQuota(q))
      .catch((err: any) => setError(err?.message || "加载失败"));
  }, [teamId]);

  const saveProfile = async () => {
    if (!canManage || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await teamApi.updateTeam(teamId, {
        name: name.trim(),
        displayName: displayName.trim() || null,
        logoUrl: logoUrl.trim() || null,
      });
      await refreshTeams();
      setMessage("企业信息已保存");
    } catch (err: any) {
      setError(err?.message || "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const transfer = async () => {
    if (!isOwner || !transferTo) return;
    if (!confirm("确定转让企业所有权？此操作不可轻易撤销。")) return;
    setBusy(true);
    try {
      await teamApi.transferOwnership(teamId, transferTo);
      await refreshTeams();
      setMessage("已转让所有权");
    } catch (err: any) {
      setError(err?.message || "转让失败");
    } finally {
      setBusy(false);
    }
  };

  const dissolve = async () => {
    if (!isOwner) return;
    if (!confirm("确定解散企业？成员将失去访问权限。")) return;
    setBusy(true);
    try {
      await teamApi.dissolveTeam(teamId);
      await refreshTeams();
      navigate("/enterprise", { replace: true });
    } catch (err: any) {
      setError(err?.message || "解散失败");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">企业设置</h1>
        <p className="mt-1 text-sm text-slate-500">积分、企业资料与所有权</p>
      </div>

      {message ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">企业积分</h2>
            <p className="mt-1 text-xs text-slate-400">额度与充值、席位购买</p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setModalTab("subscription")}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                购买席位
              </button>
              <button
                type="button"
                onClick={() => setModalTab("topup")}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                积分充值
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 px-4 py-4">
            <div className="text-xs text-slate-400">企业可用积分</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{credits}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-4">
            <div className="text-xs text-slate-400">我的可用额度</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {quota?.personalAvailable === null
                ? "不限"
                : quota?.personalAvailable ?? "—"}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-4">
            <div className="text-xs text-slate-400">本周期已用</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {quota?.creditUsedThisCycle ?? 0}
            </div>
          </div>
        </div>

        <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-slate-100">
          {ledger.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-400">暂无流水</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-xs">
              {ledger.map((row) => (
                <li key={row.id} className="flex justify-between px-3 py-2">
                  <span>
                    {row.entryType}
                    {row.note ? ` · ${row.note}` : ""}
                  </span>
                  <span className={row.amount >= 0 ? "text-teal-600" : "text-rose-600"}>
                    {row.amount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">基本信息</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-500">
            企业名称
            <input
              value={name}
              disabled={!canManage}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </label>
          <label className="text-xs text-slate-500">
            显示名
            <input
              value={displayName}
              disabled={!canManage}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </label>
          <label className="text-xs text-slate-500 md:col-span-2">
            Logo URL
            <input
              value={logoUrl}
              disabled={!canManage}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
              placeholder="https://..."
            />
          </label>
        </div>
        {canManage ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveProfile()}
            className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            保存
          </button>
        ) : null}
      </section>

      {isOwner ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">所有权与解散</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">选择新 Owner</option>
              {members
                .filter((m) => m.role !== "owner")
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user?.name || m.user?.email || m.userId}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!transferTo || busy}
              onClick={() => void transfer()}
              className="rounded-xl border border-amber-300 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            >
              转让所有权
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void dissolve()}
              className="rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
            >
              解散企业
            </button>
          </div>
        </section>
      ) : null}

      {modalTab && teamId ? (
        <TeamManagementModal
          teamId={teamId}
          initialTab={modalTab}
          onClose={() => {
            setModalTab(null);
            void teamCreditsApi
              .getAccount(teamId)
              .then((a) => setCredits(a.balance ?? 0))
              .catch(() => null);
            void teamCreditsApi
              .getLedger(teamId, 20, 0)
              .then(setLedger)
              .catch(() => []);
          }}
        />
      ) : null}
    </div>
  );
}
