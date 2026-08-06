import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";
import { SHOW_ENTERPRISE_CONSOLE } from "@/config/featureFlags";
import { useAuthStore } from "@/stores/authStore";
import { refreshTeams, useTeamStore } from "@/stores/teamStore";
import { pickPreferredEnterprise } from "@/utils/enterpriseAccess";
import WelcomeShaderBackground from "@/components/background/WelcomeShaderBackground";

/**
 * 企业版入口：纯账号密码登录。
 * 有企业权限 → 进该企业项目管理；否则留在本页继续用表单登录（不展示「非成员」引导页）。
 */
export default function EnterpriseLoginPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const authInitializing = useAuthStore((s) => s.initializing);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const tryEnterConsole = async (
    teams?: Awaited<ReturnType<typeof refreshTeams>>,
  ): Promise<boolean> => {
    const list =
      teams ?? (await refreshTeams().catch(() => useTeamStore.getState().teams));
    const preferred = pickPreferredEnterprise(list);
    if (!preferred) return false;
    setActiveTeamId(preferred.id);
    navigate(`/enterprise/${preferred.id}/projects`, { replace: true });
    return true;
  };

  // 已登录且有企业 → 静默进后台；无企业 → 保持登录表单，不切「非成员」页
  useEffect(() => {
    if (!SHOW_ENTERPRISE_CONSOLE) {
      navigate("/app", { replace: true });
      return;
    }
    if (authInitializing || !user) return;
    void tryEnterConsole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authInitializing]);

  if (!SHOW_ENTERPRISE_CONSOLE) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setLocalError("");
    clearError();
    try {
      // 换号登录前先清掉当前会话，避免个人账号挡住企业表单
      if (user) {
        await logout().catch(() => undefined);
      }
      await login(phone.trim(), password);
      const entered = await tryEnterConsole();
      if (!entered) {
        setLocalError("账号或密码错误，或该账号无权进入企业后台");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : error || "登录失败";
      setLocalError(message);
    } finally {
      setBusy(false);
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
          <p className="mt-2 text-sm text-white/55">请使用企业账号登录</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
        >
          <label className="mb-4 block text-xs text-white/50">
            手机号
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="手机号"
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
                placeholder="密码"
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
            {busy ? "登录中…" : "登录"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-white/40">
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
