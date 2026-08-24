import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/stores/authStore";
import { Loader2, Eye, EyeOff, Check, RefreshCw, X } from "lucide-react";
import { authApi, type WechatOfficialSessionDetail } from "@/services/authApi";
import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";
import ProfileCompletionLoginModal from "@/components/auth/ProfileCompletionLoginModal";
import AgreementConsentModal from "@/components/auth/AgreementConsentModal";
import {
  DEFAULT_INCOMPLETE_PROFILE,
  fetchExtendedProfile,
  queueOpenSettingsSection,
} from "@/services/extendedProfileApi";
import { validateInviteCode } from "@/services/referralApi";
import { useTranslation } from "react-i18next";
import WelcomeShaderBackground from "@/components/background/WelcomeShaderBackground";
import {
  buildTeamInviteHomePath,
  peekPendingTeamInvite,
} from "@/utils/teamInvite";
import { setRuntimeDeploymentBrand, getDeploymentBrand } from "@/config/deploymentBrand";
import { refreshTeams, useTeamStore } from "@/stores/teamStore";
import { pickPreferredEnterprise } from "@/utils/enterpriseAccess";

const WECHAT_LOGIN_HIDDEN_ORIGINS = new Set(["http://101.96.217.132:8080"]);

type LoginIdentity = "personal" | "enterprise" | "linglong";

export default function LoginPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const wechatLoginEnabled = !WECHAT_LOGIN_HIDDEN_ORIGINS.has(currentOrigin);
  const [tab, setTab] = useState<"wechat" | "password" | "sms">("password");
  const [loginIdentity, setLoginIdentity] = useState<LoginIdentity>(() =>
    getDeploymentBrand() === "linglong" ? "linglong" : "personal",
  );
  const [enterpriseError, setEnterpriseError] = useState<string | null>(null);
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
  const [wechatBindPassword, setWechatBindPassword] = useState("");
  const [wechatBindConfirm, setWechatBindConfirm] = useState("");
  const [wechatInviteCode, setWechatInviteCode] = useState("");
  const [wechatInviteCodeValid, setWechatInviteCodeValid] = useState<boolean | null>(null);
  const [wechatInviterName, setWechatInviterName] = useState<string | null>(null);
  const [showWechatBindPassword, setShowWechatBindPassword] = useState(false);
  const [showWechatBindConfirm, setShowWechatBindConfirm] = useState(false);
  const [wechatBindSubmitting, setWechatBindSubmitting] = useState(false);
  const consumingRef = useRef(false);
  const consumedSessionIdRef = useRef<string | null>(null);
  const appliedNavIdentityRef = useRef(false);
  const [profileGateActive, setProfileGateActive] = useState(false);
  const [isProfilePromptOpen, setIsProfilePromptOpen] = useState(false);
  const [profileRewardCredits, setProfileRewardCredits] = useState(100);
  const [pendingReturnTo, setPendingReturnTo] = useState("/app");
  const { login, loginWithSms, error, user, setAuthenticatedUser, clearError } = useAuthStore();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  const showWechatTab = wechatLoginEnabled && loginIdentity === "personal";
  const registerPath = loginIdentity === "linglong" ? "/auth/register/linglong" : "/auth/register";

  const returnTo = useMemo(() => {
    const fromState = typeof location.state?.from === "string" ? location.state.from : "";
    const fromQuery = new URLSearchParams(location.search).get("returnTo") || "";
    const candidate = fromState || fromQuery || "/app";
    if (!candidate.startsWith("/") || candidate.startsWith("//")) {
      return "/app";
    }
    // 有待处理的企业邀请时，登录后必须回到带邀请参数的首页，才能弹出同意/拒绝确认窗
    const pendingInvite = peekPendingTeamInvite();
    if (pendingInvite && !/[?&](teamInvite|inviteCode|team_invite)=/.test(candidate)) {
      return buildTeamInviteHomePath(pendingInvite);
    }
    return candidate;
  }, [location.search, location.state]);

  useEffect(() => {
    if (user && !profileGateActive && !isProfilePromptOpen) {
      navigate(returnTo, { replace: true });
    }
  }, [user, navigate, returnTo, isProfilePromptOpen, profileGateActive]);

  useEffect(() => {
    if (!showWechatTab && tab === "wechat") {
      setTab("password");
    }
  }, [showWechatTab, tab]);

  const tryEnterEnterpriseConsole = async () => {
    const list = await refreshTeams().catch(() => useTeamStore.getState().teams);
    const preferred = pickPreferredEnterprise(list);
    if (!preferred) return false;
    setActiveTeamId(preferred.id);
    navigate(`/enterprise/${preferred.id}/projects`, { replace: true });
    return true;
  };

  const handleIdentityChange = (identity: LoginIdentity) => {
    setEnterpriseError(null);
    setWechatError(null);
    clearError();
    if (identity === "enterprise") {
      setRuntimeDeploymentBrand("tai");
    } else if (identity === "linglong") {
      setRuntimeDeploymentBrand("linglong");
    } else {
      setRuntimeDeploymentBrand("tai");
    }
    setLoginIdentity(identity);
  };

  useEffect(() => {
    if (appliedNavIdentityRef.current) return;
    const identity = (location.state as { identity?: LoginIdentity } | null)?.identity;
    if (identity !== "linglong" && identity !== "enterprise" && identity !== "personal") {
      return;
    }
    appliedNavIdentityRef.current = true;
    setEnterpriseError(null);
    setWechatError(null);
    clearError();
    if (identity === "enterprise") {
      setRuntimeDeploymentBrand("tai");
    } else if (identity === "linglong") {
      setRuntimeDeploymentBrand("linglong");
    } else {
      setRuntimeDeploymentBrand("tai");
    }
    setLoginIdentity(identity);
  }, [location.state, clearError]);

  const welcomeTitle = useMemo(() => {
    if (loginIdentity === "enterprise") return t("auth.login.enterpriseWelcome");
    if (loginIdentity === "linglong") return t("auth.login.linglongWelcome");
    return t("auth.login.welcome");
  }, [loginIdentity, t]);

  const identitySwitcherOptions = useMemo(() => {
    if (loginIdentity === "personal") {
      return [
        { key: "enterprise" as const, label: t("auth.login.identityEnterprise") },
        { key: "linglong" as const, label: t("auth.login.identityLinglong") },
      ];
    }
    if (loginIdentity === "enterprise") {
      return [
        { key: "personal" as const, label: t("auth.login.identityPersonal") },
        { key: "linglong" as const, label: t("auth.login.identityLinglong") },
      ];
    }
    return [
      { key: "enterprise" as const, label: t("auth.login.identityEnterprise") },
      { key: "personal" as const, label: t("auth.login.identityPersonal") },
    ];
  }, [loginIdentity, t]);

  const agreementInsideCard = false; // Always render agreement outside the card

  const activateProfileGate = () => {
    setProfileGateActive(true);
  };

  const releaseProfileGate = () => {
    setProfileGateActive(false);
  };

  const openProfilePrompt = (destination: string, rewardCredits = 100) => {
    setPendingReturnTo(destination);
    setProfileRewardCredits(rewardCredits);
    setIsProfilePromptOpen(true);
  };

  const fetchProfileAfterLogin = async () => {
    try {
      return await fetchExtendedProfile({ allowRefresh: true });
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      return await fetchExtendedProfile({ allowRefresh: true });
    }
  };

  const finishLoginFlow = async (destination: string) => {
    let profile = DEFAULT_INCOMPLETE_PROFILE;
    try {
      profile = await fetchProfileAfterLogin();
    } catch (err) {
      console.warn("加载个人资料状态失败，仍展示完善提示:", err);
    }

    if (!profile.isComplete) {
      openProfilePrompt(destination, profile.rewardCredits || 100);
      return;
    }

    releaseProfileGate();
    navigate(destination, { replace: true });
  };

  const handleProfilePromptClose = () => {
    setIsProfilePromptOpen(false);
    releaseProfileGate();
    navigate(pendingReturnTo || returnTo, { replace: true });
  };

  const handleProfilePromptGoFill = () => {
    setIsProfilePromptOpen(false);
    releaseProfileGate();
    const destination = pendingReturnTo || returnTo;
    queueOpenSettingsSection("profile");
    navigate(destination, {
      replace: true,
      state: { openSettingsSection: "profile" },
    });
  };

  const finalizeWechatLogin = async (nextUser: any, nextReturnTo?: string) => {
    activateProfileGate();
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
      setWechatBindPassword("");
      setWechatBindConfirm("");
      setWechatInviteCode("");
      setWechatInviteCodeValid(null);
      setWechatInviterName(null);
      setShowWechatBindPassword(false);
      setShowWechatBindConfirm(false);
      setAgreeTerms(false);    } catch (err: any) {
      setWechatSession(null);
      setWechatError(err?.message || t("auth.login.wechatLoadFailed"));
    } finally {
      setWechatLoading(false);
      setWechatRefreshing(false);
    }
  };

  useEffect(() => {
    if (!showWechatTab || tab !== "wechat") return;
    if (wechatSession || wechatLoading || wechatRefreshing || wechatError) return;
    void createWechatSession("initial");
  }, [showWechatTab, tab, wechatSession, wechatLoading, wechatRefreshing, wechatError]);

  useEffect(() => {
    if (!showWechatTab || tab !== "wechat" || !wechatSession?.id) return;
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
  }, [showWechatTab, tab, wechatSession, t]);

  const performLogin = async () => {
    setIsSubmitting(true);
    setEnterpriseError(null);
    activateProfileGate();
    try {
      if (tab === "password") {
        await login(phone, password);
      } else {
        await loginWithSms(phone, code || "");
      }

      if (loginIdentity === "enterprise") {
        const entered = await tryEnterEnterpriseConsole();
        if (!entered) {
          releaseProfileGate();
          setEnterpriseError(t("auth.login.enterpriseNoAccess"));
          return;
        }
        releaseProfileGate();
        return;
      }

      await finishLoginFlow(returnTo);
    } catch (err) {
      releaseProfileGate();
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

  const handleWechatInviteCodeBlur = async () => {
    if (!wechatInviteCode.trim()) {
      setWechatInviteCodeValid(null);
      setWechatInviterName(null);
      return;
    }
    const result = await validateInviteCode(wechatInviteCode.trim());
    setWechatInviteCodeValid(result.valid);
    if (result.valid && result.inviterName) {
      setWechatInviterName(result.inviterName);
    } else {
      setWechatInviterName(null);
    }
  };

  const submitWechatBind = async () => {
    if (!wechatSession?.id) return;
    const trimmedPhone = wechatBindPhone.trim();
    const trimmedCode = wechatBindCode.trim();
    if (!trimmedPhone || !trimmedCode) {
      setWechatError(t("auth.login.wechatBindIncomplete"));
      return;
    }
    if (!/^\d{6}$/.test(trimmedCode)) {
      setWechatError(t("auth.register.codeInvalid"));
      return;
    }
    if (wechatBindPassword.length < 6) {
      setWechatError(t("auth.login.wechatBindPasswordRequired"));
      return;
    }
    if (wechatBindPassword !== wechatBindConfirm) {
      setWechatError(t("auth.register.passwordMismatch"));
      return;
    }
    if (wechatInviteCode.trim()) {
      if (wechatInviteCodeValid === null) {
        const result = await validateInviteCode(wechatInviteCode.trim());
        setWechatInviteCodeValid(result.valid);
        if (!result.valid) {
          setWechatError(t("auth.register.invalidInvite"));
          return;
        }
      } else if (wechatInviteCodeValid === false) {
        setWechatError(t("auth.register.invalidInvite"));
        return;
      }
    }
    setWechatBindSubmitting(true);
    setWechatError(null);
    try {
      const result = await authApi.bindWechatOfficialPhone(wechatSession.id, {
        phone: trimmedPhone,
        code: trimmedCode,
        password: wechatBindPassword,
        confirmPassword: wechatBindConfirm,
        inviteCode: wechatInviteCode.trim() || undefined,
      });
      void finalizeWechatLogin(result.user, result.returnTo);
    } catch (err: any) {
      setWechatError(err?.message || t("auth.login.wechatBindFailed"));
    } finally {
      setWechatBindSubmitting(false);
    }
  };

  const handleWechatBindSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) {
      setIsAgreementModalOpen(true);
      return;
    }
    await submitWechatBind();
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

  const handleAgreementAgree = async () => {
    setAgreeTerms(true);
    setIsAgreementModalOpen(false);
    if (needsWechatPhoneBind) {
      await submitWechatBind();
      return;
    }
    await performLogin();
  };

  const agreementSection = (
    <div className='flex items-start justify-center gap-2'>
      <button
        type='button'
        onClick={() => setAgreeTerms(!agreeTerms)}
        className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
          agreeTerms ? "border-white bg-white" : "border-white/50 bg-transparent"
        }`}
      >
        {agreeTerms && <Check className='h-2.5 w-2.5 text-black' />}
      </button>
      <label
        onClick={() => setAgreeTerms(!agreeTerms)}
        className='cursor-pointer text-left text-xs leading-5 text-white/90'
      >
        {t("auth.agreements.prefix")}{" "}
        <Link to='/legal/terms' className='text-blue-400 hover:text-blue-300' target='_blank' onClick={(e) => e.stopPropagation()}>
          {t("auth.agreements.terms")}
        </Link>
        {t("auth.agreements.comma")}
        <Link to='/legal/privacy' className='text-blue-400 hover:text-blue-300' target='_blank' onClick={(e) => e.stopPropagation()}>
          {t("auth.agreements.privacy")}
        </Link>{" "}
        {t("auth.agreements.and")}{" "}
        <Link to='/legal/community' className='text-blue-400 hover:text-blue-300' target='_blank' onClick={(e) => e.stopPropagation()}>
          {t("auth.agreements.community")}
        </Link>
      </label>
    </div>
  );

  const identitySwitcher = (
    <div className='mt-6 flex items-center justify-center gap-10 border-t border-white/10 pt-5 text-sm'>
      {identitySwitcherOptions.map((option) => (
        <button
          key={option.key}
          type='button'
          onClick={() => handleIdentityChange(option.key)}
          className='text-white/70 transition-colors hover:text-white'
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className='relative flex min-h-dvh items-start justify-center overflow-y-auto overflow-x-hidden px-4 py-6 sm:items-center sm:overflow-y-hidden sm:px-6 sm:py-10'>
      <WelcomeShaderBackground className='z-[1]' />
      <div className='absolute inset-0 z-[2] bg-black/55' />

      <div className='relative z-10 my-auto flex w-full max-w-[420px] flex-col items-center gap-5'>
        <Card
          className={`flex w-full flex-col rounded-2xl border border-blue-400/35 bg-[#071428]/75 p-6 shadow-[0_0_32px_rgba(59,130,246,0.12)] backdrop-blur-xl transition-[min-height] duration-300 sm:p-8 ${
            needsWechatPhoneBind ? "min-h-[720px]" : ""
          }`}
        >
          {/* Logo */}
          <div className='mx-auto flex shrink-0 items-center justify-center sm:mb-2'>
            <img src='/TAI-logo.png' alt='TAI' className='h-12 w-auto pb-1 pr-3.5 sm:h-14' />
          </div>

          {/* 标题 */}
          <div className='mb-6 flex shrink-0 items-center justify-center gap-3 sm:mb-7'>
            <span className='typing-cursor-line-shorter' />
            <p className='text-sm text-white/95'>{welcomeTitle}</p>
            <span className='typing-cursor-line-shorter' />
          </div>

          <div className='flex flex-1 justify-center'>
            <div className='flex w-full flex-col'>
              {/* Tab 切换 */}
              <div className='mb-6 flex shrink-0 items-center justify-center gap-12 sm:mb-7 sm:gap-16'>
                {showWechatTab && (
                  <button
                    type='button'
                    className='flex flex-col items-center'
                    onClick={() => handleTabChange("wechat")}
                  >
                    <span className={tab === "wechat" ? "text-sm font-semibold text-blue-400" : "text-sm text-white/85 transition-all hover:text-white"}>
                      {t("auth.login.wechatTitle")}
                    </span>
                    <span className={tab === "wechat" ? "mt-2 block h-0.5 w-full rounded-full bg-blue-400" : "mt-2 block h-0.5 w-0"} />
                  </button>
                )}
                <button
                  type='button'
                  className='flex flex-col items-center'
                  onClick={() => handleTabChange("password")}
                >
                  <span className={tab === "password" ? "text-sm font-semibold text-blue-400" : "text-sm text-white/85 transition-all hover:text-white"}>
                    {t("auth.login.passwordTab")}
                  </span>
                  <span className={tab === "password" ? "mt-2 block h-0.5 w-full rounded-full bg-blue-400" : "mt-2 block h-0.5 w-0"} />
                </button>
                <button
                  type='button'
                  className='flex flex-col items-center'
                  onClick={() => handleTabChange("sms")}
                >
                  <span className={tab === "sms" ? "text-sm font-semibold text-blue-400" : "text-sm text-white/85 transition-all hover:text-white"}>
                    {t("auth.login.smsTab")}
                  </span>
                  <span className={tab === "sms" ? "mt-2 block h-0.5 w-full rounded-full bg-blue-400" : "mt-2 block h-0.5 w-0"} />
                </button>
              </div>

              <div className='flex-1 px-1 pb-1'>
                {showWechatTab && tab === "wechat" ? (
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
                          <div className='space-y-1 text-left'>
                            <p className='text-sm font-medium text-white'>
                              {t("auth.login.wechatRegisterTitle")}
                            </p>
                            <p className='text-xs text-white/75'>
                              {wechatSession?.displayName
                                ? t("auth.login.wechatBindHintWithName", { name: wechatSession.displayName })
                                : t("auth.login.wechatBindHint")}
                            </p>
                          </div>
                        </div>

                        <form onSubmit={handleWechatBindSubmit} className='space-y-3'>
                          <div className='relative'>
                            <img src='/register1.png' alt='' className='absolute left-6 top-1/2 z-10 h-5 w-auto -translate-y-1/2 pointer-events-none' />
                            <Input
                              placeholder={t("auth.register.phonePlaceholder")}
                              value={wechatBindPhone}
                              onChange={(e) => setWechatBindPhone(e.target.value)}
                              required
                              className='bg-[#0d2847] border-transparent text-gray-300 placeholder:text-gray-400 focus:bg-[#144272] focus:border-transparent transition-all duration-200 rounded-xl h-12 pl-12'
                            />
                          </div>

                          <div className='relative flex items-center rounded-xl h-12 bg-[#0d2847] border-transparent focus-within:bg-[#144272] transition-all duration-200'>
                            <img src='/register2.png' alt='' className='absolute left-6 top-1/2 z-10 h-5 w-auto -translate-y-1/2 pointer-events-none' />
                            <Input
                              placeholder={t("auth.login.codePlaceholder")}
                              value={wechatBindCode}
                              onChange={(e) => setWechatBindCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              required
                              maxLength={6}
                              className='flex-1 bg-transparent border-0 text-gray-300 placeholder:text-gray-400 focus:bg-transparent focus:border-0 focus:ring-0 focus-visible:ring-0 h-full pl-12 pr-2 shadow-none'
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

                          <div className='relative'>
                            <img src='/register3.png' alt='' className='absolute left-6 top-1/2 z-10 h-5 w-auto -translate-y-1/2 pointer-events-none' />
                            <Input
                              placeholder={t("auth.register.passwordPlaceholder")}
                              type={showWechatBindPassword ? "text" : "password"}
                              value={wechatBindPassword}
                              onChange={(e) => setWechatBindPassword(e.target.value)}
                              minLength={6}
                              required
                              className='bg-[#0d2847] border-transparent text-gray-300 placeholder:text-gray-400 focus:bg-[#144272] focus:border-transparent transition-all duration-200 rounded-xl h-12 pl-12 pr-10'
                            />
                            <button
                              type='button'
                              onClick={() => setShowWechatBindPassword((v) => !v)}
                              className='absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors'
                            >
                              {showWechatBindPassword ? <Eye className='h-5 w-5' /> : <EyeOff className='h-5 w-5' />}
                            </button>
                          </div>

                          <div className='relative'>
                            <img src='/register3.png' alt='' className='absolute left-6 top-1/2 z-10 h-5 w-auto -translate-y-1/2 pointer-events-none' />
                            <Input
                              placeholder={t("auth.register.confirmPlaceholder")}
                              type={showWechatBindConfirm ? "text" : "password"}
                              value={wechatBindConfirm}
                              onChange={(e) => setWechatBindConfirm(e.target.value)}
                              required
                              className='bg-[#0d2847] border-transparent text-gray-300 placeholder:text-gray-400 focus:bg-[#144272] focus:border-transparent transition-all duration-200 rounded-xl h-12 pl-12 pr-10'
                            />
                            <button
                              type='button'
                              onClick={() => setShowWechatBindConfirm((v) => !v)}
                              className='absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors'
                            >
                              {showWechatBindConfirm ? <Eye className='h-5 w-5' /> : <EyeOff className='h-5 w-5' />}
                            </button>
                          </div>

                          <div className='relative'>
                            <img src='/register4.png' alt='' className='absolute left-6 top-1/2 z-10 h-5 w-auto -translate-y-1/2 pointer-events-none' />
                            <Input
                              placeholder={t("auth.register.invitePlaceholder")}
                              value={wechatInviteCode}
                              onChange={(e) => {
                                setWechatInviteCode(e.target.value);
                                setWechatInviteCodeValid(null);
                              }}
                              onBlur={() => void handleWechatInviteCodeBlur()}
                              className='bg-[#0d2847] border-transparent text-gray-300 placeholder:text-gray-400 focus:bg-[#144272] focus:border-transparent transition-all duration-200 rounded-xl h-12 pl-12 pr-10'
                            />
                            {wechatInviteCodeValid !== null && (
                              <div className='absolute right-3 top-1/2 -translate-y-1/2'>
                                {wechatInviteCodeValid ? (
                                  <Check className='h-5 w-5 text-green-400' />
                                ) : (
                                  <X className='h-5 w-5 text-red-400' />
                                )}
                              </div>
                            )}
                            {wechatInviteCodeValid && wechatInviterName && (
                              <div className='mt-1 ml-1 text-xs text-green-400'>
                                {t("auth.register.inviteFrom", { name: wechatInviterName })}
                              </div>
                            )}
                          </div>

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
                  {error && <div className='text-sm text-red-400 drop-shadow-md'>{error}</div>}
                  {enterpriseError && <div className='text-sm text-red-400 drop-shadow-md'>{enterpriseError}</div>}
                  {agreementInsideCard && agreementSection}
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
                      type='button'
                      onClick={() => setIsForgotPasswordOpen(true)}
                      className='text-left text-white/80 transition-all duration-200 hover:text-white'
                    >
                      {t("auth.login.forgotPassword")}
                    </button>
                    <Link
                      to={registerPath}
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

                  {error && <div className='text-sm text-red-400 drop-shadow-md'>{error}</div>}
                  {enterpriseError && <div className='text-sm text-red-400 drop-shadow-md'>{enterpriseError}</div>}
                  {agreementInsideCard && agreementSection}
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
                      type='button'
                      onClick={() => setIsForgotPasswordOpen(true)}
                      className='text-left text-white/80 transition-all duration-200 hover:text-white'
                    >
                      {t("auth.login.forgotPassword")}
                    </button>
                    <Link
                      to={registerPath}
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

          {identitySwitcher}
        </Card>

        {!agreementInsideCard && <div className='w-full px-1'>{agreementSection}</div>}
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
