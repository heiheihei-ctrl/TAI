import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Building2, LogIn } from "lucide-react";
import { SHOW_ENTERPRISE_CONSOLE } from "@/config/featureFlags";
import { parseTeamInviteCode } from "@/utils/teamInvite";
import { teamApi } from "@/services/teamApi";
import { refreshTeams, useTeamStore } from "@/stores/teamStore";

export default function EnterpriseHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const teams = useTeamStore((s) => s.teams);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const orgTeams = useMemo(
    () => teams.filter((t) => !t.isPersonal),
    [teams]
  );

  useEffect(() => {
    if (!SHOW_ENTERPRISE_CONSOLE) {
      navigate("/app", { replace: true });
      return;
    }
    void refreshTeams()
      .then((list) => {
        const enterprises = list.filter((t) => !t.isPersonal);
        if (enterprises.length === 1) {
          setActiveTeamId(enterprises[0].id);
          navigate(`/enterprise/${enterprises[0].id}`, { replace: true });
        }
      })
      .catch(() => {});
  }, [navigate, setActiveTeamId]);

  if (!SHOW_ENTERPRISE_CONSOLE) return null;

  const openTeam = (teamId: string) => {
    setActiveTeamId(teamId);
    navigate(`/enterprise/${teamId}`);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = parseTeamInviteCode(inviteCode) || inviteCode.trim();
    if (!code || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await teamApi.joinByCode(code);
      setSuccess(result.message || t("enterprise.home.successDefault"));
      setInviteCode("");
    } catch (err: any) {
      setError(err?.message || t("enterprise.home.submit"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("enterprise.home.title")}</h1>
          <p className="mt-3 text-sm text-white/55">
            {t("enterprise.home.subtitle")}
          </p>
        </div>

        {orgTeams.length > 0 ? (
          <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 text-xs uppercase tracking-wide text-white/40">
              {t("enterprise.home.myEnterprises")}
            </div>
            <div className="space-y-2">
              {orgTeams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => openTeam(team.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {team.displayName || team.name}
                    </div>
                    <div className="text-xs text-white/45">
                      {t("enterprise.home.memberCountWithRole", { count: team.memberCount, role: team.myRole })}
                    </div>
                  </div>
                  <span className="text-xs text-teal-300">{t("enterprise.home.enterConsole")}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-8 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-8 text-center">
            <p className="text-sm text-white/70">{t("enterprise.home.noAccess")}</p>
            <p className="mt-2 text-xs text-white/40">
              {t("enterprise.home.noAccessHint")}
            </p>
          </div>
        )}

        <form
          onSubmit={handleApply}
          className="rounded-2xl border border-white/10 bg-white/5 p-5"
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <LogIn className="h-4 w-4" />
            {t("enterprise.home.inviteTitle")}
          </div>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder={t("enterprise.home.invitePlaceholder")}
            className="mb-3 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-white/30 focus:border-teal-400/50"
          />
          <button
            type="submit"
            disabled={busy || !inviteCode.trim()}
            className="w-full rounded-xl bg-teal-500 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "{t(\"enterprise.home.submitting\")}" : "{t(\"enterprise.home.submit\")}"}
          </button>
          {error ? <p className="mt-3 text-center text-sm text-rose-300">{error}</p> : null}
          {success ? <p className="mt-3 text-center text-sm text-teal-300">{success}</p> : null}
        </form>

        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-8 text-center text-sm text-white/40 hover:text-white/70"
        >
          {t("enterprise.home.backHome")}
        </button>
      </div>
    </div>
  );
}
