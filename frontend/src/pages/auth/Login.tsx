import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/stores/authStore";
import { Loader2, Eye, EyeOff, Check, RefreshCw } from "lucide-react";
import { authApi, type WechatOfficialSessionDetail } from "@/services/authApi";
import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";
import ProfileCompletionLoginModal from "@/components/auth/ProfileCompletionLoginModal";
import AgreementConsentModal from "@/components/auth/AgreementConsentModal";
import {
  fetchExtendedProfile,
  queueOpenSettingsSection,
} from "@/services/extendedProfileApi";
import { useTranslation } from "react-i18next";
import WelcomeShaderBackground from "@/components/background/WelcomeShaderBackground";

const WECHAT_LOGIN_HIDDEN_ORIGINS = new Set(["http://101.96.217.132:8080"]);

export default function LoginPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const wechatLoginEnabled = !WECHAT_LOGIN_HIDDEN_ORIGINS.has(currentOrigin);
  const [tab, setTab] = useState<"wechat" | "password" | "sms">(
    wechatLoginEnabled ? "wechat" : "password"
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [sendCooldown, setSendCooldown] = useState(0);
  const [hasSentCode, setHasSentCode] = useState(false);
  const [wechatSession, setWechatSession] = useState<WechatOfficialSessionDetail | null>(null);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [wechatRefreshing, setWechatRefreshing] = useState(false);
  const [wechatError, setWechatError] = useState<string | null>(null);
  const [wechatBindPhone, setWechatBindPhone] = useState("");
  const [wechatBindCode, setWechatBindCode] = useState("");
  const [wechatInviteCode, setWechatInviteCode] = useState("");
  const [wechatBindSubmitting, setWechatBindSubmitting] = useState(false);
  const consumingRef = useRef(false);
  const consumedSessionIdRef = useRef<string | null>(null);
  const holdAutoRedirectRef = useRef(false);
  const [isProfilePromptOpen, setIsProfilePromptOpen] = useState(false);
  const [profileRewardCredits, setProfileRewardCredits] = useState(100);
  const [pendingReturnTo, setPendingReturnTo] = useState("/app");
  const { login, loginWithSms, error, user, setAuthenticatedUser, clearError } = useAuthStore();

  const returnTo = useMemo(() => {
    const fromState = typeof location.state?.from === "string" ? location.state.from : "";
    const fromQuery = new URLSearchParams(location.search).get("returnTo") || "";
    const candidate = fromState || fromQuery || "/app";
    if (!candidate.startsWith("/") || candidate.startsWith("//")) {
      return "/app";
    }
    return candidate;
  }, [location.search, location.state]);

  useEffect(() => {
    if (user && !holdAutoRedirectRef.current && !isProfilePromptOpen) {
      navigate(returnTo, { replace: true });
    }
  }, [user, navigate, returnTo, isProfilePromptOpen]);

  useEffect(() => {
    if (!wechatLoginEnabled && tab === "wechat") {
      setTab("password");
    }
  }, [wechatLoginEnabled, tab]);

  const finishLoginFlow = async (destination: string) => {
    try {
      const profile = await fetchExtendedProfile();
      if (!profile.isComplete) {
        setPendingReturnTo(destination);
        setProfileRewardCredits(profile.rewardCredits || 100);
        setIsProfilePromptOpen(true);
        return;
      }
    } catch (err) {
      console.warn("加载完善资料状态失败，跳过登录提示:", err);
    }
    holdAutoRedirectRef.current = false;
    navigate(destination, { replace: true });
  };

  const handleProfilePromptClose = () => {
    setIsProfilePromptOpen(false);
    holdAutoRedirectRef.current = false;
    navigate(pendingReturnTo || returnTo, { replace: true });
  };

  const handleProfilePromptGoFill = () => {
    setIsProfilePromptOpen(false);
    holdAutoRedirectRef.current = false;
    const destination = pendingReturnTo || returnTo;
    queueOpenSettingsSection("profile");
    navigate(destination, {
      replace: true,
      state: { openSettingsSection: "profile" },
    });
  };

  const finalizeWechatLogin = async (nextUser: any, nextReturnTo?: string) => {
    holdAutoRedirectRef.current = true;
    setAuthenticatedUser(nextUser, "server");
    await finishLoginFlow(nextReturnTo || returnTo);
  };

  const createWechatSession = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") {
      setWechatRefreshing(true);
    } else {
      setWechatLoading(true);
    }
    setWechatError(null);
    consumingRef.current = false;
    consumedSessionIdRef.current = null;
    try {
      const session = await authApi.createWechatOfficialSession({ returnTo });
      setWechatSession({
        ...session,
        authorizedAt: null,
        needsPhoneBind: session.status === "needs_phone_bind",
        hasScannedIdentity: false,
        nickname: null,
        displayName: null,
        avatarUrl: null,
      });
      setWechatBindPhone("");
      setWechatBindCode("");
      setWechatInviteCode("");
    } catch (err: any) {
      setWechatSession(null);
      setWechatError(err?.message || t("auth.login.wechatLoadFailed"));
    } finally {
      setWechatLoading(false);
      setWechatRefreshing(false);
    }
  };

  useEffect(() => {
    if (!wechatLoginEnabled || tab !== "wechat") return;
    if (wechatSession || wechatLoading || wechatRefreshing || wechatError) return;
    void createWechatSession("initial");
  }, [wechatLoginEnabled, tab, wechatSession, wechatLoading, wechatRefreshing, wechatError]);

  useEffect(() => {
    if (!wechatLoginEnabled || tab !== "wechat" || !wechatSession?.id) return;
    if (consumedSessionIdRef.current === wechatSession.id) return;

    if (wechatSession.status === "authorized") {
      if (consumingRef.current) return;
      consumingRef.current = true;
      consumedSessionIdRef.current = wechatSession.id;
      setWechatError(null);
      void authApi
        .consumeWechatOfficialSession(wechatSession.id)
        .then((result) => {
          void finalizeWechatLogin(result.user, result.returnTo);
        })
        .catch((err: any) => {
          consumingRef.current = false;
          consumedSessionIdRef.current = null;
          setWechatError(err?.message || t("auth.login.wechatLoadFailed"));
        });
      return;
    }

    if (wechatSession.status === "expired") {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const next = await authApi.getWechatOfficialSession(wechatSession.id);
        setWechatSession(next);
      } catch (err: any) {
        setWechatError(err?.message || t("auth.login.wechatLoadFailed"));
      }
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [wechatLoginEnabled, tab, wechatSession, t]);

  const performLogin = async () => {
    setIsSubmitting(true);
    holdAutoRedirectRef.current = true;
    try {
      if (tab === "password") {
        await login(phone, password);
      } else {
        await loginWithSms(phone, code || "");
      }
      await finishLoginFlow(returnTo);
    } catch (err) {
      holdAutoRedirectRef.current = false;
      console.error("登录失败:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) {
      setIsAgreementModalOpen(true);
      return;
    }
    await performLogin();
  };

  const handleAgreementAgree = async () => {
    setAgreeTerms(true);
    setIsAgreementModalOpen(false);
    await performLogin();
  };

  const sendSmsCode = async (targetPhone: string) => {
    if (sendCooldown > 0) return;
    if (!targetPhone) {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: {
            message: t("auth.login.phoneRequired"),
            type: "error",
          },
        })
      );
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(targetPhone)) {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: {
            message: t("auth.login.phoneInvalid"),
            type: "error",
          },
        })
      );
      return;
    }
    try {
      await authApi.sendSms({ phone: targetPhone });
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: {
            message: t("auth.login.smsSent"),
            type: "success",
          },
        })
      );
      setHasSentCode(true);
      setSendCooldown(60);
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: {
            message: err?.message || t("auth.register.sendFailed"),
            type: "error",
          },
        })
      );
    }
  };

  useEffect(() => {
    if (sendCooldown <= 0) return;
    const timer = setInterval(() => setSendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [sendCooldown]);

  const handleWechatBindSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wechatSession?.id) return;
    if (!wechatBindPhone.trim() || !wechatBindCode.trim()) {
      setWechatError(t("auth.login.wechatBindIncomplete"));
      return;
    }
    setWechatBindSubmitting(true);
    setWechatError(null);
    try {
      const result = await authApi.bindWechatOfficialPhone(wechatSession.id, {
        phone: wechatBindPhone.trim(),
        code: wechatBindCode.trim(),
        inviteCode: wechatInviteCode.trim() || undefined,
      });
      void finalizeWechatLogin(result.user, result.returnTo);
    } catch (err: any) {
      setWechatError(err?.message || t("auth.login.wechatBindFailed"));
    } finally {
      setWechatBindSubmitting(false);
    }
  };

  const isWechatQrExpired = wechatSession?.status === "expired";
  const canRefreshWechatQr = isWechatQrExpired && !wechatRefreshing && !wechatLoading;
  const needsWechatPhoneBind = Boolean(wechatSession?.needsPhoneBind);

  const handleWechatQrRefresh = () => {
    if (!canRefreshWechatQr) return;
    void createWechatSession("refresh");
  };

  const handleTabChange = (nextTab: "wechat" | "password" | "sms") => {
    setWechatError(null);
    clearError();
    setTab(nextTab);
  };

  const agreementSection = (
    <div className='flex items-center gap-2'>
      <button
        type='button'
        onClick={() => setAgreeTerms(!agreeTerms)}
        className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-all sm:mt-0 ${
          agreeTerms ? "border-white bg-white" : "border-white/50 bg-transparent"
        }`}
      >
        {agreeTerms && <Check className='h-2.5 w-2.5 text-black' />}
      </button>
      <label
        onClick={() => setAgreeTerms(!agreeTerms)}
        className='cursor-pointer text-left text-xs leading-5 text-white'
      >
        {t("auth.agreements.prefix")}{" "}
        <Link to='/legal/terms' className='mx-1 text-blue-400 underline hover:text-blue-300' target='_blank' onClick={(e) => e.stopPropagation()}>
          {t("auth.agreements.terms")}
        </Link>
        {t("auth.agreements.comma")}
        <Link to='/legal/privacy' className='mx-1 text-blue-400 underline hover:text-blue-300' target='_blank' onClick={(e) => e.stopPropagation()}>
          {t("auth.agreements.privacy")}
        </Link>{" "}
        {t("auth.agreements.and")}{" "}
        <Link to='/legal/community' className='mx-1 text-blue-400 underline hover:text-blue-300' target='_blank' onClick={(e) => e.stopPropagation()}>
          {t("auth.agreements.community")}
        </Link>
      </label>
    </div>
  );

  return (
    <div className='relative flex min-h-dvh items-start justify-center overflow-y-auto overflow-x-hidden px-4 py-6 sm:items-center sm:overflow-y-hidden sm:px-6 sm:py-10'>
      <WelcomeShaderBackground className='z-[1]' />
      <div className='absolute inset-0 bg-black/50 z-[2]'></div>

      <div className='relative z-10 my-auto w-full max-w-xl flex flex-col items-center'>
        <Card className='flex min-h-[560px] w-full flex-col rounded-3xl border border-blue-400/20 bg-blue-500/10 p-6 shadow-2xl backdrop-blur-md transition-[min-height,height] duration-300 sm:p-8'>
          {/* Logo 区域 */}
          <div className='flex shrink-0 items-center justify-center sm:mb-5'>
            <img src='/TAI-logo.png' alt='TAI' className='h-12 w-auto sm:h-14 pr-3.5 pb-1' />
          </div>

          {/* 欢迎登录 + 光标 */}
          <div className='mb-6 flex shrink-0 items-center justify-center gap-3'>
            <span className='typing-cursor-line-shorter' />
            <p className='text-sm text-white'>{t("auth.login.welcome")}</p>
            <span className='typing-cursor-line-shorter' />
          </div>

          <div className='flex flex-1 justify-center'>
            <div className='flex w-full max-w-xl flex-col'>
              {/* Tab 切换 */}
              <div className='mb-6 flex shrink-0 items-center justify-center gap-12 sm:mb-8 sm:gap-16'>
                {wechatLoginEnabled && (
                  <button
                    className='flex flex-col items-center'
                    onClick={() => handleTabChange("wechat")}
                  >
                    <span className={tab === "wechat" ? "text-sm font-semibold text-blue-400" : "text-sm text-white transition-all hover:text-white"}>
                      {t("auth.login.wechatTitle")}
                    </span>
                    <span className={tab === "wechat" ? "mt-2 block h-0.5 w-full bg-blue-400 rounded-full" : "mt-2 block h-0.5 w-0"} />
                  </button>
                )}
                <button
                  className='flex flex-col items-center'
                  onClick={() => handleTabChange("password")}
                >
                  <span className={tab === "password" ? "text-sm font-semibold text-blue-400" : "text-sm text-white transition-all hover:text-white"}>
                    {t("auth.login.passwordTab")}
                  </span>
                  <span className={tab === "password" ? "mt-2 block h-0.5 w-full bg-blue-400 rounded-full" : "mt-2 block h-0.5 w-0"} />
                </button>
                <button
                  className='flex flex-col items-center'
                  onClick={() => handleTabChange("sms")}
                >
                  <span className={tab === "sms" ? "text-sm font-semibold text-blue-400" : "text-sm text-white transition-all hover:text-white"}>
                    {t("auth.login.smsTab")}
                  </span>
                  <span className={tab === "sms" ? "mt-2 block h-0.5 w-full bg-blue-400 rounded-full" : "mt-2 block h-0.5 w-0"} />
                </button>
              </div>

              <div className='flex-1 px-1 pb-1'>
                {wechatLoginEnabled && tab === "wechat" ? (
                <div className='w-full space-y-5 sm:space-y-6'>
                  <div className='flex flex-col items-center gap-4 text-white'>
                    {needsWechatPhoneBind ? (
                      <div className='w-full max-w-md'>
                        <div className='mb-5 flex items-center gap-3'>
                          {wechatSession?.avatarUrl ? (
                            <img
                              src={wechatSession.avatarUrl}
                              alt={wechatSession.displayName || wechatSession.nickname || "wechat"}
                              className='h-11 w-11 rounded-full object-cover'
                            />
                          ) : (
                            <div className='flex h-11 w-11 items-center justify-center rounded-full bg-blue-500/30 text-sm font-semibold text-blue-200'>
                              {(wechatSession?.displayName || wechatSession?.nickname || "微").slice(0, 1)}
                            </div>
                          )}
                          <p className='text-sm text-white/90'>
                            {wechatSession?.displayName
                              ? t("auth.login.wechatBindHintWithName", { name: wechatSession.displayName })
                              : t("auth.login.wechatBindHint")}
                          </p>
                        </div>

                        <form onSubmit={handleWechatBindSubmit} className='space-y-3'>
                          <Input
                            placeholder={t("auth.login.phonePlaceholder")}
                            value={wechatBindPhone}
                            onChange={(e) => setWechatBindPhone(e.target.value)}
                            className='bg-[#0d2847] border-transparent text-gray-300 placeholder:text-gray-400 focus:bg-[#144272] focus:border-transparent transition-all duration-200 rounded-xl h-12'
                          />
                          <div className='relative flex items-center rounded-xl h-12 bg-[#0d2847] border-transparent focus-within:bg-[#144272] transition-all duration-200'>
                            <Input
                              placeholder={t("auth.login.codePlaceholder")}
                              value={wechatBindCode}
                              onChange={(e) => setWechatBindCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              maxLength={6}
                              className='flex-1 bg-transparent border-0 text-gray-300 placeholder:text-gray-400 focus:bg-transparent focus:border-0 focus:ring-0 focus-visible:ring-0 h-full pr-2 shadow-none'
                            />
                            <div className='h-5 w-px bg-white/20 shrink-0' />
                            <button
                              type='button'
                              onClick={() => void sendSmsCode(wechatBindPhone)}
                              disabled={sendCooldown > 0 || !wechatBindPhone.trim()}
                              className='px-4 text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:text-blue-400/50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 h-full'
                            >
                              {sendCooldown > 0
                                ? `${sendCooldown}秒后重新获取`
                                : hasSentCode
                                  ? "重新发送"
                                  : "发送"}
                            </button>
                          </div>
                          <Input
                            placeholder={t("auth.register.invitePlaceholder")}
                            value={wechatInviteCode}
                            onChange={(e) => setWechatInviteCode(e.target.value)}
                            className='bg-[#0d2847] border-transparent text-gray-300 placeholder:text-gray-400 focus:bg-[#144272] focus:border-transparent transition-all duration-200 rounded-xl h-12'
                          />
                          <Button
                            type='submit'
                            className='w-full bg-blue-500 hover:bg-blue-600 text-white border-transparent rounded-xl h-12 font-medium backdrop-blur-sm transition-all duration-200 disabled:opacity-70 hover:shadow-lg'
                            disabled={wechatBindSubmitting}
                          >
                            {wechatBindSubmitting ? (
                              <>
                                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                                {t("auth.login.wechatBindSubmitLoading")}
                              </>
                            ) : (
                              t("auth.login.wechatBindSubmit")
                            )}
                          </Button>
                        </form>
                      </div>
                    ) : (
                      <>
                        <button
                          type='button'
                          onClick={handleWechatQrRefresh}
                          disabled={!canRefreshWechatQr}
                          className={`group relative flex items-center justify-center overflow-hidden rounded-2xl bg-white/95 p-2.5 shadow-lg transition-transform duration-200 ${
                            canRefreshWechatQr ? "cursor-pointer hover:scale-[1.01]" : "cursor-default"
                          } ${wechatRefreshing ? "cursor-wait" : ""}`}
                          aria-label={t("auth.login.wechatRefresh")}
                        >
                          {wechatLoading ? (
                            <div className='flex h-40 w-40 flex-col items-center justify-center gap-3 text-slate-600'>
                              <Loader2 className='h-8 w-8 animate-spin' />
                              <span className='text-sm'>{t("auth.login.wechatLoading")}</span>
                            </div>
                          ) : wechatSession?.qrCodeUrl ? (
                            <div className='relative h-40 w-40'>
                              <img
                                src={wechatSession.qrCodeUrl}
                                alt={t("auth.login.wechatScanAlt")}
                                className='h-full w-full rounded-xl object-contain'
                              />
                              {isWechatQrExpired && (
                                <span className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-slate-600/0 opacity-0 transition-all duration-200 group-hover:bg-slate-600/60 group-hover:opacity-100 group-hover:backdrop-grayscale'>
                                  <RefreshCw className={`h-6 w-6 text-white drop-shadow-md ${wechatRefreshing ? "animate-spin" : ""}`} strokeWidth={2.5} />
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className='flex h-40 w-40 items-center justify-center text-center text-sm text-slate-500'>
                              {t("auth.login.wechatUnavailable")}
                            </div>
                          )}
                        </button>

                        <div className='space-y-1 text-center'>
                          <p className='text-sm text-white'>{t("auth.login.wechatHint")}</p>
                        </div>

                        {wechatSession?.status === "authorized" && (
                          <div className='text-sm text-blue-300'>{t("auth.login.wechatAuthorizing")}</div>
                        )}

                        {wechatSession?.status === "expired" && (
                          <div className='text-sm text-amber-300'>{t("auth.login.wechatExpired")}</div>
                        )}
                      </>
                    )}

                    {(wechatError || (tab === "wechat" && error)) && (
                      <div className='w-full text-center text-sm text-red-300'>
                        {wechatError || error}
                      </div>
                    )}
                  </div>
                </div>
              ) : tab === "password" ? (
                <form onSubmit={onSubmit} className='space-y-5 sm:space-y-6 max-w-md mx-auto'>
                  <div className="relative">
                    <img src="/register1.png" alt="" className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-auto z-10 pointer-events-none" />
                    <Input
                      placeholder={t("auth.login.phonePlaceholder")}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className='bg-[#0d2847] border-transparent text-gray-300 placeholder:text-gray-400 focus:bg-[#144272] focus:border-transparent transition-all duration-200 rounded-xl h-12 pl-12'
                    />
                  </div>
                  <div className='relative'>
                    <img src="/register3.png" alt="" className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-auto z-10 pointer-events-none" />
                    <Input
                      placeholder={t("auth.login.passwordPlaceholder")}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className='bg-[#0d2847] border-transparent text-gray-300 placeholder:text-gray-400 focus:bg-[#144272] focus:border-transparent transition-all duration-200 rounded-xl h-12 pl-12 pr-10'
                    />
                    <button
                      type='button'
                      onClick={() => setShowPassword(!showPassword)}
                      className='absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors'
                    >
                      {showPassword ? <Eye className='h-5 w-5' /> : <EyeOff className='h-5 w-5' />}
                    </button>
                  </div>
                  {error && <div className='text-red-400 text-sm drop-shadow-md'>{error}</div>}
                  {agreementSection}
                  <Button
                    type='submit'
                    className='w-full bg-blue-500 hover:bg-blue-600 text-white border-transparent rounded-xl h-12 font-medium backdrop-blur-sm transition-all duration-200 disabled:opacity-70 hover:shadow-lg'
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        {t("auth.login.submitting")}
                      </>
                    ) : (
                      t("auth.login.submit")
                    )}
                  </Button>
                  <div className='flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4'>
                    <button
                      onClick={() => setIsForgotPasswordOpen(true)}
                      className='text-left text-white/80 transition-all duration-200 hover:text-white'
                    >
                      {t("auth.login.forgotPassword")}
                    </button>
                    <Link
                      to='/auth/register'
                      className='text-left text-white/80 transition-all duration-200 hover:text-white sm:text-right'
                    >
                      {t("auth.login.registerNow")}
                    </Link>
                  </div>
                </form>
              ) : (
                <form onSubmit={onSubmit} className='space-y-5 sm:space-y-6 max-w-md mx-auto'>
                  <div className="relative">
                    <img src="/register1.png" alt="" className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-auto z-10 pointer-events-none" />
                    <Input
                      placeholder={t("auth.login.phonePlaceholder")}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className='bg-[#0d2847] border-transparent text-gray-300 placeholder:text-gray-400 focus:bg-[#144272] focus:border-transparent transition-all duration-200 rounded-xl h-12 pl-12'
                    />
                  </div>

                  {/* 验证码输入框 + 内嵌发送按钮（参考注册页样式） */}
                  <div className="relative flex items-center rounded-xl h-12 bg-[#0d2847] border-transparent focus-within:bg-[#144272] transition-all duration-200">
                    <img src="/register2.png" alt="" className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-auto z-10 pointer-events-none" />
                    <Input
                      placeholder={t("auth.login.codePlaceholder")}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength={6}
                      className='flex-1 bg-transparent border-0 text-gray-300 placeholder:text-gray-400 focus:bg-transparent focus:border-0 focus:ring-0 focus-visible:ring-0 h-full pl-12 pr-2 shadow-none'
                    />
                    <div className="h-5 w-px bg-white/20 shrink-0" />
                    <button
                      type="button"
                      onClick={() => void sendSmsCode(phone)}
                      disabled={sendCooldown > 0 || !phone.trim()}
                      className="px-4 text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:text-blue-400/50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 h-full"
                    >
                      {sendCooldown > 0
                        ? `${sendCooldown}秒后重新获取`
                        : hasSentCode
                          ? "重新发送"
                          : "发送"}
                    </button>
                  </div>

                  {error && <div className='text-red-400 text-sm drop-shadow-md'>{error}</div>}
                  {agreementSection}
                  <Button
                    type='submit'
                    className='w-full bg-blue-500 hover:bg-blue-600 text-white border-transparent rounded-xl h-12 font-medium backdrop-blur-sm transition-all duration-200 disabled:opacity-70 hover:shadow-lg'
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        {t("auth.login.submitting")}
                      </>
                    ) : (
                      t("auth.login.submit")
                    )}
                  </Button>

                  <div className='flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4'>
                    <button
                      onClick={() => setIsForgotPasswordOpen(true)}
                      className='text-left text-white/80 transition-all duration-200 hover:text-white'
                    >
                      {t("auth.login.forgotPassword")}
                    </button>
                    <Link
                      to='/auth/register'
                      className='text-left text-white/80 transition-all duration-200 hover:text-white sm:text-right'
                    >
                      {t("auth.login.registerNow")}
                    </Link>
                  </div>
                </form>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <AgreementConsentModal
        isOpen={isAgreementModalOpen}
        onAgree={() => void handleAgreementAgree()}
        onDisagree={() => setIsAgreementModalOpen(false)}
      />

      <ProfileCompletionLoginModal
        isOpen={isProfilePromptOpen}
        rewardCredits={profileRewardCredits}
        onClose={handleProfilePromptClose}
        onGoFill={handleProfilePromptGoFill}
      />

      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        onSuccess={() => {
          handleTabChange("password");
        }}
      />
    </div>
  );
}
