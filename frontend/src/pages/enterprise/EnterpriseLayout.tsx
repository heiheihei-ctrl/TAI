import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo } from "react";
import {
  Building2,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  ArrowRightToLine,
  ChevronDown,
  FolderKanban,
} from "lucide-react";
import { SHOW_ENTERPRISE_CONSOLE } from "@/config/featureFlags";
import { useTeamStore, refreshTeams } from "@/stores/teamStore";
import { cn } from "@/lib/utils";

export default function EnterpriseLayout() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const teams = useTeamStore((s) => s.teams);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  const enterprises = useMemo(
    () => teams.filter((t) => !t.isPersonal && t.enterpriseEnabled !== false),
    [teams]
  );

  const team = useMemo(
    () => enterprises.find((t) => t.id === teamId) ?? null,
    [enterprises, teamId]
  );
  const canManage = team?.myRole === "owner" || team?.myRole === "admin";

  const nav = useMemo(() => {
    const items: Array<{
      to: string;
      end?: boolean;
      label: string;
      icon: typeof LayoutDashboard;
    }> = [
      { to: "", end: true, label: "总览", icon: LayoutDashboard },
      { to: "assets", label: "素材库", icon: FolderOpen },
    ];
    if (canManage) {
      items.splice(1, 0,
        { to: "projects", label: "项目管理", icon: FolderKanban },
        { to: "members", label: "席位管理", icon: Users },
        { to: "requests", label: "加入申请", icon: ClipboardList },
      );
      items.push({ to: "settings", label: "企业设置", icon: Settings });
    }
    return items;
  }, [canManage]);

  useEffect(() => {
    if (!SHOW_ENTERPRISE_CONSOLE) {
      navigate("/app", { replace: true });
      return;
    }
    void refreshTeams().catch(() => {});
  }, [navigate]);

  useEffect(() => {
    if (!teamId) return;
    if (teams.length === 0) return;
    if (!team) {
      navigate("/enterprise", { replace: true });
      return;
    }
    setActiveTeamId(team.id);
  }, [team, teamId, teams.length, navigate, setActiveTeamId]);

  if (!SHOW_ENTERPRISE_CONSOLE) return null;

  const enterWorkspace = () => {
    if (!teamId) return;
    setActiveTeamId(teamId);
    navigate(`/app?teamId=${encodeURIComponent(teamId)}`);
  };

  const switchEnterprise = (nextId: string) => {
    if (!nextId || nextId === teamId) return;
    setActiveTeamId(nextId);
    navigate(`/enterprise/${nextId}`);
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-[1400px]">
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-slate-200/80 bg-white px-4 py-6">
          <div className="mb-6 px-2">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {team?.displayName || team?.name || "企业后台"}
                </div>
                <div className="text-[11px] text-slate-400">
                  {canManage ? "管理员" : "成员"} · Enterprise
                </div>
              </div>
            </div>

            {enterprises.length > 1 ? (
              <label className="block text-[11px] text-slate-400">
                切换身份 / 企业
                <div className="relative mt-1">
                  <select
                    value={teamId || ""}
                    onChange={(e) => switchEnterprise(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-xs text-slate-700 outline-none"
                  >
                    {enterprises.map((ent) => (
                      <option key={ent.id} value={ent.id}>
                        {ent.displayName || ent.name}
                        {ent.myRole === "owner" || ent.myRole === "admin"
                          ? "（管理）"
                          : "（成员）"}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                </div>
              </label>
            ) : null}
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const path = item.to
                ? `/enterprise/${teamId}/${item.to}`
                : `/enterprise/${teamId}`;
              return (
                <NavLink
                  key={item.label}
                  to={path}
                  end={Boolean(item.end)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors",
                      isActive
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={enterWorkspace}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
            >
              <ArrowRightToLine className="h-4 w-4" />
              进入创作
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" />
              返回首页
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-6 md:p-8">
          <Outlet context={{ teamId: teamId!, team, canManage }} />
        </main>
      </div>
    </div>
  );
}
