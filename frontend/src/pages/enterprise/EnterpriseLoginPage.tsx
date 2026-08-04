import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { SHOW_ENTERPRISE_CONSOLE } from "@/config/featureFlags";
import { useAuthStore } from "@/stores/authStore";
import { refreshTeams, useTeamStore } from "@/stores/teamStore";
import { parseTeamInviteCode } from "@/utils/teamInvite";
import { teamApi } from "@/services/teamApi";
import WelcomeShaderBackground from "@/components/background/WelcomeShaderBackground";

function pickEnterprises(teams: Awaited<ReturnType<typeof refreshTeams>>) {
  return teams.filter((t) => !t.isPersonal && t.enterpriseEnabled !== false);
}

/**
 * 企业版入口：企业账号登录页。
 * 已登录且有企业权限时自动进入后台。
 */
export default function EnterpriseLoginPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const authInitializing = useAuthStore((s) => s.initializing);
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [noEnterprise, setNoEnterprise] = useState(false);

  const enterConsole = async (teams?: Awaited<ReturnType<typeof refreshTeams>>) => {
    const list = teams ?? (await refreshTeams().catch(() => useTeamStore.getState().teams));
    const enterprises = pickEnterprises(list);
    if (enterprises.length === 0) {
      setNoEnterprise(true);
      setLocalError("该账号尚未开通企业，请联系 TAI 平台或使用邀请码申请加入");
      return false;
    }
    setNoEnterprise(false);
    const preferred =
      enterprises.find((t) => t.myRole === "owner" || t.myRole === "admin") ||
      enterprises[0];
    setActiveTeamId(preferred.id);
    navigate(`/enterprise/${preferred.id}`, { replace: true });
    return true;
  };

  useEffect(() => {
    if (!SHOW_ENTERPRISE_CONSOLE) {
      navigate("/app", { replace: true });
      return;
    }
    if (authInitializing || !user) return;
    void enterConsole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authInitializing]);

  if (!SHOW_ENTERPRISE_CONSOLE) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setLocalError("");
    setInviteMsg("");
    clearError();
    try {
      await login(phone.trim(), password);
      await enterConsole();
    } catch (err: any) {
      setLocalError(err?.message || error || "登录失败");
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = parseTeamInviteCode(inviteCode) || inviteCode.trim();
    if (!code || inviteBusy) return;
    if (!user) {
      setInviteMsg("请先登录企业账号，再提交邀请码申请");
      return;
    }
    setInviteBusy(true);
    setInviteMsg("");
    try {
      const result = await teamApi.joinByCode(code);
      setInviteMsg(result.message || "申请已提交，请等待企业管理员审核");
      setInviteCode("");
    } catch (err: any) {
      setInviteMsg(err?.message || "提交失败");
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <WelcomeShaderBackground className="z-0" />
      <div className="pointer-events-none fixed inset-0 z-[1] bg-[#020818]/45" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">企业版登录</h1>
          <p className="mt-2 text-sm text-white/55">
            使用平台派发的企业管理员账号，或已加入企业的成员账号登录
          </p>
        </div>

        {!user ? (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
          >
            <label className="mb-4 block text-xs text-white/50">
              手机号
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="企业账号手机号"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-teal-400/50"
                autoComplete="username"
              />
            </label>
            <label className="mb-4 block text-xs text-white/50">
              密码
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="登录密码"
                  className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 pr-10 text-sm text-white outline-none placeholder:text-white/30 focus:border-teal-400/50"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {(localError || error) && (
              <p className="mb-3 text-center text-sm text-rose-300">{localError || error}</p>
            )}

            <button
              type="submit"
              disabled={busy || !phone.trim() || !password}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "登录中…" : "登录企业后台"}
            </button>
          </form>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
            <p className="text-sm text-white/70">
              已登录为 {user.phone || user.name || "当前账号"}
            </p>
            {localError ? (
              <p className="mt-3 text-sm text-rose-300">{localError}</p>
            ) : (
              <p className="mt-3 text-sm text-white/45">正在进入企业后台…</p>
            )}
            {noEnterprise ? (
              <button
                type="button"
                onClick={() => void enterConsole()}
                className="mt-4 w-full rounded-xl border border-white/15 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                重新检查企业权限
              </button>
            ) : null}
          </div>
        )}

        <form
          onSubmit={handleApply}
          className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md"
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <LogIn className="h-4 w-4" />
            邀请码申请加入
          </div>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="输入邀请码或粘贴邀请链接"
            className="mb-3 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-white/30 focus:border-teal-400/50"
          />
          <button
            type="submit"
            disabled={inviteBusy || !inviteCode.trim()}
            className="w-full rounded-xl border border-teal-400/40 bg-teal-500/20 py-2.5 text-sm font-medium text-teal-100 disabled:opacity-50"
          >
            {inviteBusy ? "提交中…" : "提交申请"}
          </button>
          {inviteMsg ? (
            <p className="mt-3 text-center text-sm text-teal-200">{inviteMsg}</p>
          ) : null}
        </form>

        <div className="mt-6 space-y-2 text-center text-sm text-white/40">
          <p>
            个人创作请{" "}
            <Link to="/auth/login" className="text-teal-300 hover:underline">
              前往个人登录
            </Link>
          </p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="hover:text-white/70"
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
