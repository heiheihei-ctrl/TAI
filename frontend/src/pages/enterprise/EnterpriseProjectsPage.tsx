import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { projectApi, type Project } from "@/services/projectApi";
import type { TeamInfo } from "@/stores/teamStore";
import { useTeamStore } from "@/stores/teamStore";

type OutletCtx = { teamId: string; team: TeamInfo | null; canManage: boolean };

export default function EnterpriseProjectsPage() {
  const { teamId: paramTeamId } = useParams<{ teamId: string }>();
  const { teamId: ctxTeamId, canManage } = useOutletContext<OutletCtx>();
  const teamId = paramTeamId || ctxTeamId;
  const navigate = useNavigate();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    if (!teamId) return;
    const list = await projectApi.listByTeam(teamId);
    setProjects(Array.isArray(list) ? list : []);
  };

  useEffect(() => {
    if (!canManage) {
      navigate(`/enterprise/${teamId}`, { replace: true });
      return;
    }
    reload().catch((err: any) => setError(err?.message || "加载失败"));
  }, [teamId, canManage, navigate]);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || busy) return;
    setBusy(true);
    setError("");
    try {
      await projectApi.create({
        name: name.trim() || "未命名项目",
        teamId,
      });
      setName("");
      await reload();
    } catch (err: any) {
      setError(err?.message || "创建失败");
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">项目管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          企业下的画布项目（与企业账户、席位分离）
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={createProject}
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="min-w-[220px] flex-1 text-xs text-slate-500">
          新建项目
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="项目名称"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "创建中…" : "创建项目"}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {projects.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">暂无项目</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {projects.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {p.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {p.updatedAt
                      ? `更新于 ${new Date(p.updatedAt).toLocaleString()}`
                      : p.id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTeamId(teamId);
                    navigate(
                      `/app?projectId=${encodeURIComponent(p.id)}&teamId=${encodeURIComponent(teamId)}`
                    );
                  }}
                  className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
                >
                  打开创作
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
