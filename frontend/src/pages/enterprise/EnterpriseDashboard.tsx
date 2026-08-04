import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { teamApi } from "@/services/teamApi";
import { teamCreditsApi, teamMyQuotaApi } from "@/services/teamCreditsApi";
import { projectApi, type Project } from "@/services/projectApi";
import type { TeamInfo } from "@/stores/teamStore";
import { useTeamStore } from "@/stores/teamStore";

type OutletCtx = { teamId: string; team: TeamInfo | null; canManage: boolean };

export default function EnterpriseDashboard() {
  const { teamId: paramTeamId } = useParams<{ teamId: string }>();
  const { teamId: ctxTeamId, canManage } = useOutletContext<OutletCtx>();
  const teamId = paramTeamId || ctxTeamId;
  const navigate = useNavigate();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  const [data, setData] = useState<Awaited<
    ReturnType<typeof teamApi.getEnterpriseDashboard>
  > | null>(null);
  const [quota, setQuota] = useState<Awaited<
    ReturnType<typeof teamMyQuotaApi.getMyQuota>
  > | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    void Promise.all([
      teamApi.getEnterpriseDashboard(teamId),
      teamMyQuotaApi.getMyQuota(teamId).catch(() => null),
      projectApi.listByTeam(teamId).catch(() => [] as Project[]),
    ])
      .then(([dash, q, proj]) => {
        if (cancelled) return;
        setData(dash);
        setQuota(q);
        setProjects(Array.isArray(proj) ? proj : []);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const myCreditsCards = useMemo(() => {
    return [
      {
        label: "企业可用积分",
        value: String(data?.availableCredits ?? "—"),
      },
      {
        label: "我的可用额度",
        value:
          quota?.personalAvailable === null
            ? "不限"
            : String(quota?.personalAvailable ?? "—"),
      },
      {
        label: "本周期已用",
        value: String(quota?.creditUsedThisCycle ?? 0),
      },
    ];
  }, [data, quota]);

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return <div className="text-sm text-slate-400">加载中…</div>;
  }

  const projectRows =
    projects.length > 0
      ? projects
      : data.recentProjects.map((p) => ({
          id: p.id,
          name: p.name,
          updatedAt: p.updatedAt,
        }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {data.displayName || data.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {canManage
            ? `企业总览 · 席位 ${data.memberCount}/${data.maxSeats} · 项目 ${data.projectCount}`
            : "成员工作台 · 查看积分并切换参与的项目"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {myCreditsCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm"
          >
            <div className="text-xs text-slate-400">{card.label}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {canManage ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "已用席位", value: `${data.memberCount} / ${data.maxSeats}` },
            { label: "项目数", value: String(data.projectCount) },
            { label: "素材数", value: String(data.assetCount) },
            { label: "文件夹", value: String(data.folderCount) },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
            >
              <div className="text-xs text-slate-400">{card.label}</div>
              <div className="mt-1 text-xl font-semibold">{card.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            {canManage ? "最近项目" : "我参与的项目"}
          </h2>
          {canManage ? (
            <button
              type="button"
              onClick={() => navigate(`/enterprise/${teamId}/projects`)}
              className="text-xs text-teal-700 hover:underline"
            >
              项目管理
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setActiveTeamId(teamId);
                navigate(`/app?teamId=${encodeURIComponent(teamId)}`);
              }}
              className="text-xs text-teal-700 hover:underline"
            >
              进入创作工作区
            </button>
          )}
        </div>
        {projectRows.length === 0 ? (
          <p className="text-sm text-slate-400">
            暂无项目。管理员可在创作工作区新建企业项目。
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {projectRows.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTeamId(teamId);
                    navigate(
                      `/app?projectId=${encodeURIComponent(p.id)}&teamId=${encodeURIComponent(teamId)}`
                    );
                  }}
                  className="flex w-full items-center justify-between py-3 text-left hover:bg-slate-50"
                >
                  <span className="text-sm text-slate-800">{p.name}</span>
                  <span className="text-xs text-slate-400">
                    {p.updatedAt
                      ? new Date(p.updatedAt).toLocaleString()
                      : "打开"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
