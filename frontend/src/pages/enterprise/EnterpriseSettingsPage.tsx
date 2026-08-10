import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, Key, Loader2, Upload } from "lucide-react";
import { teamApi, type TeamMember } from "@/services/teamApi";
import { teamCreditsApi, teamMyQuotaApi } from "@/services/teamCreditsApi";
import { refreshTeams, useTeamStore } from "@/stores/teamStore";
import { useAuthStore } from "@/stores/authStore";
import { TeamManagementModal } from "@/components/team/TeamManagementModal";
import { EnterpriseLedgerModal } from "@/components/team/EnterpriseLedgerModal";
import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";
import { uploadToOSS } from "@/services/ossUploadService";

export default function EnterpriseSettingsPage() {
  const { teamId = "" } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const team = useTeamStore((s) => s.teams.find((t) => t.id === teamId));
  const myRole = team?.myRole;
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (team && !canManage) {
      navigate(`/enterprise/${teamId}/projects`, { replace: true });
    }
  }, [team, canManage, navigate, teamId]);

  const [name, setName] = useState(team?.name || "");
  const [displayName, setDisplayName] = useState(team?.displayName || team?.name || "");
  const [logoUrl, setLogoUrl] = useState(team?.logoUrl || "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [transferTo, setTransferTo] = useState("");
  const [credits, setCredits] = useState(0);
  const [quota, setQuota] = useState<Awaited<
    ReturnType<typeof teamMyQuotaApi.getMyQuota>
  > | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalTab, setModalTab] = useState<"subscription" | "topup" | null>(null);
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

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
    ])
      .then(([, , q]) => setQuota(q))
      .catch((err: any) => setError(err?.message || "加载失败"));
  }, [teamId]);

  const handleLogoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !canManage) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      event.target.value = "";
      return;
    }
    setLogoUploading(true);
    setError("");
    try {
      const uploadResult = await uploadToOSS(file, {
        dir: "uploads/enterprise-logos/",
        fileName: file.name || `logo-${teamId || Date.now()}.png`,
        contentType: file.type || "image/png",
      });
      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || "Logo 上传失败");
      }
      setLogoUrl(uploadResult.url);
      setMessage("Logo 已上传，请点击保存生效");
    } catch (err: any) {
      setError(err?.message || "Logo 上传失败");
    } finally {
      setLogoUploading(false);
      event.target.value = "";
    }
  };

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
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">企业可用积分</div>
              <button
                type="button"
                onClick={() => setLedgerModalOpen(true)}
                className="text-xs text-teal-600 hover:text-teal-700 hover:underline font-medium"
              >
                查看详情
              </button>
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {credits.toLocaleString()}
            </div>
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
            显示名（最多 6 个字，显示在画布页左上角 Logo 右侧）
            <input
              value={displayName}
              disabled={!canManage}
              maxLength={6}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </label>
          <div className="md:col-span-2">
            <div className="text-xs text-slate-500">企业 Logo</div>
            <p className="mt-1 text-[11px] text-slate-400">
              上传后将显示在画布页左上角 Logo 位置（企业工作区）
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="企业 Logo"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Building2 className="h-6 w-6 text-slate-300" />
                )}
              </div>
              {canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleLogoSelect(e)}
                  />
                  <button
                    type="button"
                    disabled={logoUploading || busy}
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {logoUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {logoUploading ? "上传中…" : "上传图片"}
                  </button>
                  {logoUrl ? (
                    <button
                      type="button"
                      disabled={logoUploading || busy}
                      onClick={() => setLogoUrl("")}
                      className="rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                    >
                      清除
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {canManage ? (
          <button
            type="button"
            disabled={busy || logoUploading}
            onClick={() => void saveProfile()}
            className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            保存
          </button>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">账号安全</h2>
        <p className="mb-4 text-xs text-slate-400">
          通过手机验证码修改当前企业账号登录密码
        </p>
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-slate-800">修改密码</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {user?.phone
                ? `当前账号：${user.phone}`
                : "将使用当前登录账号手机号验证"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setChangePasswordOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
          >
            <Key className="h-4 w-4" />
            修改密码
          </button>
        </div>
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
          singleTab
          onClose={() => {
            setModalTab(null);
            void teamCreditsApi
              .getAccount(teamId)
              .then((a) => setCredits(a.balance ?? 0))
              .catch(() => null);
          }}
        />
      ) : null}

      {ledgerModalOpen && teamId ? (
        <EnterpriseLedgerModal
          teamId={teamId}
          onClose={() => setLedgerModalOpen(false)}
        />
      ) : null}

      <ForgotPasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        defaultPhone={user?.phone || null}
        lockedPhone
        onSuccess={() => {
          setChangePasswordOpen(false);
          setMessage("密码已修改成功");
        }}
      />
    </div>
  );
}
