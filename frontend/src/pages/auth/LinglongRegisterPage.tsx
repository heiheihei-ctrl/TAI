import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Box, Check, Eye, EyeOff, Headphones, ImageIcon, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import WelcomeShaderBackground from "@/components/background/WelcomeShaderBackground";
import { setRuntimeDeploymentBrand } from "@/config/deploymentBrand";
import { authApi } from "@/services/authApi";
import { validateInviteCode } from "@/services/referralApi";
import { useAuthStore } from "@/stores/authStore";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border border-[#162B4A] bg-[#0B182E] px-4 text-sm text-white placeholder:text-[#3B4D66] outline-none transition-colors focus:border-[#2B7FFF]/60 focus:ring-1 focus:ring-[#2B7FFF]/30";

const FEATURES = [
  { icon: Box, key: "featureSupplyChain" },
  { icon: ImageIcon, key: "featureTemplate" },
  { icon: Headphones, key: "featureService" },
  { icon: Users, key: "featureIadu" },
] as const;

export default function LinglongRegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register, login, loading, error } = useAuthStore();

  const [inviteCode, setInviteCode] = useState("");
  const [inviteCodeValid, setInviteCodeValid] = useState<boolean | null>(null);
  const [inviterName, setInviterName] = useState<string | null>(null);
  const [realName, setRealName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [hasSentCode, setHasSentCode] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  useEffect(() => {
    setRuntimeDeploymentBrand("linglong");
  }, []);

  useEffect(() => {
    const invite = searchParams.get("code");
    if (!invite) return;
    setInviteCode(invite);
    void validateInviteCode(invite).then((result) => {
      setInviteCodeValid(result.valid);
      if (result.valid && result.inviterName) {
        setInviterName(result.inviterName);
      }
    });
  }, [searchParams]);

  const handleSendCode = async () => {
    if (!phone.trim() || !/^1[3-9]\d{9}$/.test(phone)) {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { message: t("auth.register.phoneInvalid"), type: "error" },
        }),
      );
      return;
    }
    try {
      await authApi.sendSms({ phone });
      setHasSentCode(true);
      setCodeCountdown(60);
      const timer = setInterval(() => {
        setCodeCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { message: t("auth.login.smsSent"), type: "success" },
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("auth.register.sendFailed");
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { message, type: "error" },
        }),
      );
    }
  };

  const handleInviteCodeBlur = async () => {
    if (!inviteCode.trim()) {
      setInviteCodeValid(null);
      setInviterName(null);
      return;
    }
    const result = await validateInviteCode(inviteCode.trim());
    setInviteCodeValid(result.valid);
    setInviterName(result.valid && result.inviterName ? result.inviterName : null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPhone = phone.trim();
    const trimmedCode = code.trim();
    const trimmedName = realName.trim();
    const trimmedCompany = company.trim();
    const trimmedInvite = inviteCode.trim();

    if (!trimmedInvite) {
      alert(t("auth.linglongRegister.inviteRequired"));
      return;
    }
    if (!trimmedName) {
      alert(t("auth.linglongRegister.nameRequired"));
      return;
    }
    if (!trimmedCompany) {
      alert(t("auth.linglongRegister.companyRequired"));
      return;
    }
    if (!agreeTerms) {
      alert(t("auth.agreements.mustAgree"));
      return;
    }
    if (!/^\d{6}$/.test(trimmedCode)) {
      alert(t("auth.register.codeInvalid"));
      return;
    }
    if (inviteCodeValid === null) {
      const result = await validateInviteCode(trimmedInvite);
      setInviteCodeValid(result.valid);
      if (!result.valid) {
        alert(t("auth.register.invalidInvite"));
        return;
      }
    } else if (inviteCodeValid === false) {
      alert(t("auth.register.invalidInvite"));
      return;
    }

    try {
      await register(
        trimmedPhone,
        password,
        confirm,
        trimmedCode,
        trimmedName,
        undefined,
        trimmedInvite,
        trimmedCompany,
      );
      await login(trimmedPhone, password);
      navigate("/app");
    } catch {
      // store handles error
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
      <WelcomeShaderBackground className="z-[1]" />
      <div className="absolute inset-0 z-[2] bg-[#030919]/70" />

      <div className="relative z-10 w-full max-w-[960px]">
        <div className="overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_48px_rgba(43,127,255,0.12)]">
          <div className="flex flex-col md:flex-row">
            {/* Left hero panel */}
            <img
              src="/src/assets/linglong-left.png"
              alt="Linglong Register Hero"
              className="w-[534px]"
            />

            {/* Right form panel */}
            <div className="flex w-full flex-col bg-gradient-to-b from-[#070E1B] to-[#0A1426] p-8 md:w-1/2 md:p-10">
              <div className="mb-6 text-center">
                <h2 className="text-lg font-bold text-white sm:text-xl">
                  {t("auth.linglongRegister.formTitle")}
                </h2>
                <div className="mt-3 flex items-center justify-center gap-3">
                  <span className="h-px w-8 bg-white/10 sm:w-12" />
                  <p className="text-xs text-[#8C9BAE] sm:text-sm">
                    {t("auth.linglongRegister.formSubtitle")}
                  </p>
                  <span className="h-px w-8 bg-white/10 sm:w-12" />
                </div>
              </div>

              <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t("auth.linglongRegister.inviteCodePlaceholder")}
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value);
                      setInviteCodeValid(null);
                    }}
                    onBlur={() => void handleInviteCodeBlur()}
                    required
                    className={`${INPUT_CLASS} pr-10`}
                  />
                  {inviteCodeValid !== null && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {inviteCodeValid ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <X className="h-4 w-4 text-rose-400" />
                      )}
                    </div>
                  )}
                  {inviteCodeValid && inviterName && (
                    <p className="mt-1 text-xs text-emerald-400">
                      {t("auth.register.inviteFrom", { name: inviterName })}
                    </p>
                  )}
                </div>

                <input
                  type="text"
                  placeholder={t("auth.linglongRegister.namePlaceholder")}
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  required
                  className={INPUT_CLASS}
                />

                <input
                  type="text"
                  placeholder={t("auth.linglongRegister.companyPlaceholder")}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  required
                  className={INPUT_CLASS}
                />

                <input
                  type="tel"
                  placeholder={t("auth.register.phonePlaceholder")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className={INPUT_CLASS}
                />

                <div className="flex h-11 items-center overflow-hidden rounded-lg border border-[#162B4A] bg-[#0B182E]">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={t("auth.login.codePlaceholder")}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    maxLength={6}
                    className="h-full min-w-0 flex-1 bg-transparent px-4 text-sm text-white placeholder:text-[#3B4D66] outline-none"
                  />
                  <div className="h-5 w-px shrink-0 bg-white/[0.08]" />
                  <button
                    type="button"
                    onClick={() => void handleSendCode()}
                    disabled={codeCountdown > 0 || !phone.trim()}
                    className="shrink-0 px-3 text-xs text-[#2A7CF6] transition-colors hover:text-[#5a9dff] disabled:cursor-not-allowed disabled:text-[#3B4D66] sm:px-4"
                  >
                    {codeCountdown > 0
                      ? t("auth.linglongRegister.smsResendCountdown", { count: codeCountdown })
                      : hasSentCode
                        ? t("auth.register.resend")
                        : t("auth.register.send")}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.linglongRegister.passwordSetPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                    className={`${INPUT_CLASS} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C9BAE] hover:text-white"
                  >
                    {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>

                <input
                  type={showConfirm ? "text" : "password"}
                  placeholder={t("auth.linglongRegister.confirmPasswordPlaceholder")}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className={INPUT_CLASS}
                />

                {error && <p className="text-sm text-rose-400">{error}</p>}

                <div className="mt-1 flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => setAgreeTerms((v) => !v)}
                    className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      agreeTerms ? "border-[#2B7FFF] bg-[#2B7FFF]" : "border-[#3B4D66] bg-transparent"
                    }`}
                  >
                    {agreeTerms && <Check className="h-2.5 w-2.5 text-white" />}
                  </button>
                  <label
                    onClick={() => setAgreeTerms((v) => !v)}
                    className="cursor-pointer text-xs leading-5 text-[#8C9BAE]"
                  >
                    {t("auth.agreements.prefix")}{" "}
                    <Link to="/legal/terms" className="text-[#2A7CF6] hover:text-[#5a9dff]" target="_blank" onClick={(e) => e.stopPropagation()}>
                      {t("auth.agreements.terms")}
                    </Link>
                    {t("auth.agreements.comma")}
                    <Link to="/legal/privacy" className="text-[#2A7CF6] hover:text-[#5a9dff]" target="_blank" onClick={(e) => e.stopPropagation()}>
                      {t("auth.agreements.privacy")}
                    </Link>{" "}
                    {t("auth.agreements.and")}{" "}
                    <Link to="/legal/community" className="text-[#2A7CF6] hover:text-[#5a9dff]" target="_blank" onClick={(e) => e.stopPropagation()}>
                      {t("auth.agreements.community")}
                    </Link>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || !agreeTerms}
                  className="mt-1 w-full rounded-lg bg-[#2B7FFF] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3d8bff] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? t("auth.register.submitting") : t("auth.linglongRegister.submit")}
                </button>

                <div className="flex items-center justify-between text-xs text-[#8C9BAE]">
                  <Link
                    to="/auth/login"
                    state={{ identity: "linglong" }}
                    className="hover:text-white"
                  >
                    {t("auth.linglongRegister.forgotPassword")}
                  </Link>
                </div>

                <p className="pt-1 text-center text-xs text-[#8C9BAE]">
                  {t("auth.register.hasAccount")}
                  <Link
                    to="/auth/login"
                    state={{ identity: "linglong" }}
                    className="ml-1 text-[#2A7CF6] hover:text-[#5a9dff]"
                  >
                    {t("auth.linglongRegister.goLogin")}
                  </Link>
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
