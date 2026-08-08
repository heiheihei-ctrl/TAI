import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Check,
  Copy,
  Crown,
  Shield,
  User,
  UserMinus,
  SlidersHorizontal,
} from "lucide-react";
import { teamApi, type TeamMember } from "@/services/teamApi";
import { teamCreditsApi, teamSeatPackageApi } from "@/services/teamCreditsApi";
import { useAuthStore } from "@/stores/authStore";
import { useTeamStore } from "@/stores/teamStore";
import { copyTextToClipboard } from "@/utils/clipboard";
import { computeMemberEffectiveAvailable } from "@/utils/teamQuotaDisplay";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** 角色中文映射 */
function roleLabel(role: string): string {
  if (role === "owner") return "所有者";
  if (role === "admin") return "管理员";
  if (role === "member") return "普通成员";
  return role;
}

function roleIcon(role: string) {
  if (role === "owner") return <Crown className="h-3.5 w-3.5 text-amber-500" />;
  if (role === "admin") return <Shield className="h-3.5 w-3.5 text-sky-500" />;
  return <User className="h-3.5 w-3.5 text-slate-400" />;
}

export default function EnterpriseMembersPage() {
  const { teamId = "" } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const team = useTeamStore((s) => s.teams.find((t) => t.id === teamId));
  const myRole = team?.myRole;
  const canManage = myRole === "owner" || myRole === "admin";

  useEffect(() => {
    if (team && !canManage) {
      navigate(`/enterprise/${teamId}`, { replace: true });
    }
  }, [team, canManage, navigate, teamId]);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [totalSeats, setTotalSeats] = useState<number | null>(null);
  const [teamBalance, setTeamBalance] = useState(0);
  const [quotaExpandedUserId, setQuotaExpandedUserId] = useState<string | null>(
    null,
  );
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    if (!teamId) return;
    const [m, seats, acc] = await Promise.all([
      teamApi.getMembers(teamId),
      teamSeatPackageApi.listPackages(teamId).catch(() => null),
      teamCreditsApi.getAccount(teamId).catch(() => null),
    ]);
    setMembers(m);
    setTotalSeats(seats?.totalSeats ?? null);
    setTeamBalance(Math.max(0, acc?.balance ?? 0));
  };

  useEffect(() => {
    reload().catch((err: any) => setError(err?.message || "加载失败"));
  }, [teamId]);

  const createInvite = async () => {
    if (!teamId || inviteLoading) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      const invite = await teamApi.createInvite(teamId, { expiresInDays: 7 });
      setInviteCode(invite.code);
    } catch (err: any) {
      setInviteError(err?.message || "生成邀请失败");
    } finally {
      setInviteLoading(false);
    }
  };

  const inviteLink = inviteCode
    ? `${window.location.origin}/?teamInvite=${encodeURIComponent(inviteCode)}`
    : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">席位管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          已占用 {members.filter((m) => !m.seatExempt).length}
          {totalSeats != null ? ` / ${totalSeats}` : ""} 席 · 企业管理员不计席 ·
          邀请码与角色
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {canManage ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">邀请成员</h2>
            <button
              type="button"
              onClick={() => void createInvite()}
              disabled={inviteLoading}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {inviteLoading ? "生成中…" : "生成邀请码"}
            </button>
          </div>
          {inviteError ? (
            <p className="text-xs text-rose-600">{inviteError}</p>
          ) : null}
          {inviteCode ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <code className="flex-1 truncate">{inviteCode}</code>
                <button
                  type="button"
                  onClick={async () => {
                    await copyTextToClipboard(inviteCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 1500);
                  }}
                  className="text-slate-500 hover:text-slate-800"
                >
                  {copiedCode ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <span className="flex-1 truncate">{inviteLink}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await copyTextToClipboard(inviteLink);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 1500);
                  }}
                >
                  {copiedLink ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">生成后可分享邀请码或链接给同事。</p>
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            const display =
              m.user?.name || m.user?.email || m.userId.slice(0, 8);
            const isQuotaExpanded = quotaExpandedUserId === m.userId;
            const canEditQuota =
              canManage && m.role !== "owner" && m.userId !== currentUserId;
            return (
              <li key={m.userId} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                    {display.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {display}
                      {isSelf ? (
                        <span className="ml-2 text-xs text-slate-400">我</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                      {roleIcon(m.role)}
                      {roleLabel(m.role)}
                      {m.seatExempt ? (
                        <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                          不计席
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {canEditQuota && (
                    <button
                      onClick={() =>
                        setQuotaExpandedUserId(
                          isQuotaExpanded ? null : m.userId,
                        )
                      }
                      title="分配使用积分"
                      className={cn(
                        "rounded-lg p-2 transition-colors",
                        isQuotaExpanded
                          ? "bg-blue-50 text-blue-500"
                          : "text-slate-300 hover:bg-slate-100 hover:text-slate-500",
                      )}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </button>
                  )}

                  {myRole === "owner" && !isSelf && m.role !== "owner" ? (
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      value={m.role}
                      onChange={async (e) => {
                        try {
                          await teamApi.updateMemberRole(
                            teamId,
                            m.userId,
                            e.target.value,
                          );
                          await reload();
                        } catch (err: any) {
                          setError(err?.message || "更新角色失败");
                        }
                      }}
                    >
                      <option value="admin">管理员</option>
                      <option value="member">普通成员</option>
                    </select>
                  ) : null}

                  {canManage && !isSelf && m.role !== "owner" ? (
                    <button
                      type="button"
                      title="移除成员"
                      onClick={async () => {
                        if (!confirm(`确定移除 ${display}？`)) return;
                        try {
                          await teamApi.removeMember(teamId, m.userId);
                          await reload();
                        } catch (err: any) {
                          setError(err?.message || "移除失败");
                        }
                      }}
                      className={cn(
                        "rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600",
                      )}
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                {/* 配额摘要行 */}
                {!isQuotaExpanded && (
                  <MemberQuotaSummary
                    member={m}
                    canManage={canManage}
                    teamBalance={teamBalance}
                  />
                )}

                {/* 内联配额编辑器 */}
                {isQuotaExpanded && (
                  <MemberQuotaEditor
                    teamId={teamId}
                    member={m}
                    onSaved={(updated) => {
                      setMembers((prev) =>
                        prev.map((x) =>
                          x.userId === m.userId ? { ...x, ...updated } : x,
                        ),
                      );
                      setQuotaExpandedUserId(null);
                    }}
                    onCancel={() => setQuotaExpandedUserId(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ─── 配额摘要 ─────────────────────────────────────────────────── */

function MemberQuotaSummary({
  member,
  canManage = false,
  teamBalance = 0,
}: {
  member: {
    creditQuotaMonthly?: number | null;
    creditQuotaTotal?: number | null;
    creditUsedThisCycle?: number;
    creditUsedTotal?: number;
  };
  canManage?: boolean;
  teamBalance?: number;
}) {
  const hasMonthly = member.creditQuotaMonthly != null;
  const hasTotal = member.creditQuotaTotal != null;
  const unlimited = !hasMonthly && !hasTotal;
  const effectiveAvailable = computeMemberEffectiveAvailable(member, teamBalance);

  if (unlimited) {
    if (canManage) {
      return (
        <div className="mt-1.5 pl-12 flex flex-wrap gap-3 text-[10px] text-slate-400">
          <span>个人分配：不限</span>
          <span>
            可用{" "}
            <span className="text-slate-600 font-medium">
              {effectiveAvailable.toLocaleString()}
            </span>
            （团队池 {teamBalance.toLocaleString()}）
          </span>
        </div>
      );
    }
    return (
      <div className="mt-1.5 pl-12 flex flex-wrap gap-3 text-[10px] text-slate-400">
        <span>个人分配：不限</span>
        <span>
          可用{" "}
          <span className="text-slate-600 font-medium">
            {effectiveAvailable.toLocaleString()}
          </span>
        </span>
      </div>
    );
  }

  const monthlyUsed = member.creditUsedThisCycle ?? 0;
  const totalUsed = member.creditUsedTotal ?? 0;
  const monthlyRemaining = Math.max(
    0,
    (member.creditQuotaMonthly ?? 0) - monthlyUsed,
  );
  const totalRemaining = Math.max(
    0,
    (member.creditQuotaTotal ?? 0) - totalUsed,
  );

  return (
    <div className="mt-1.5 pl-12 flex flex-wrap gap-3 text-[10px] text-slate-400">
      <span>
        可用{" "}
        <span className="text-slate-700 font-semibold">
          {effectiveAvailable.toLocaleString()}
        </span>
      </span>
      {hasMonthly && (
        <span className="flex items-center gap-0.5">
          {canManage ? "月度分配" : "月度剩余"}
          <span className="text-slate-600 font-medium mx-0.5">
            {(canManage ? monthlyUsed : monthlyRemaining).toLocaleString()}
          </span>
          /
          <span className="text-slate-500 mx-0.5">
            {member.creditQuotaMonthly!.toLocaleString()}
          </span>
        </span>
      )}
      {hasTotal && (
        <span className="flex items-center gap-0.5">
          {canManage ? "总量分配" : "总量剩余"}
          <span className="text-slate-600 font-medium mx-0.5">
            {(canManage ? totalUsed : totalRemaining).toLocaleString()}
          </span>
          /
          <span className="text-slate-500 mx-0.5">
            {member.creditQuotaTotal!.toLocaleString()}
          </span>
        </span>
      )}
      {canManage && <span>团队池 {teamBalance.toLocaleString()}</span>}
    </div>
  );
}

/* ─── 配额编辑器 ───────────────────────────────────────────────── */

function MemberQuotaEditor({
  teamId,
  member,
  onSaved,
  onCancel,
}: {
  teamId: string;
  member: TeamMember;
  onSaved: (updated: Partial<TeamMember>) => void;
  onCancel: () => void;
}) {
  const [monthlyEnabled, setMonthlyEnabled] = useState(
    member.creditQuotaMonthly != null,
  );
  const [totalEnabled, setTotalEnabled] = useState(
    member.creditQuotaTotal != null,
  );
  const [monthly, setMonthly] = useState<string>(
    member.creditQuotaMonthly?.toString() ?? "",
  );
  const [total, setTotal] = useState<string>(
    member.creditQuotaTotal?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const monthlyVal = monthlyEnabled ? parseInt(monthly, 10) : null;
    const totalVal = totalEnabled ? parseInt(total, 10) : null;
    if (monthlyEnabled && (isNaN(monthlyVal!) || monthlyVal! < 0)) {
      setError("月度配额须为非负整数");
      return;
    }
    if (totalEnabled && (isNaN(totalVal!) || totalVal! < 0)) {
      setError("总量配额须为非负整数");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await teamApi.setMemberQuota(teamId, member.userId, {
        monthly: monthlyVal,
        total: totalVal,
      });
      onSaved({ creditQuotaMonthly: monthlyVal, creditQuotaTotal: totalVal });
    } catch (e: any) {
      setError(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 pl-12 pr-2 pb-3 space-y-2.5">
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
          分配使用积分
        </p>

        {/* 月度上限 */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={monthlyEnabled}
            onChange={(e) => setMonthlyEnabled(e.target.checked)}
            className="rounded accent-blue-500"
          />
          <span className="text-xs text-slate-600 w-16 shrink-0">月度上限</span>
          {monthlyEnabled ? (
            <div className="flex items-center gap-1.5 flex-1">
              <input
                type="number"
                min={0}
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                placeholder="如 10000"
                className="flex-1 text-xs px-2 py-1 rounded-lg border border-slate-200 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
              />
              <span className="text-[10px] text-slate-400 shrink-0">
                积分/月
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">不限</span>
          )}
        </label>
        {monthlyEnabled && (
          <p className="text-[10px] text-slate-400 pl-6">
            本周期已用：
            {member.creditUsedThisCycle?.toLocaleString() ?? 0} 积分，每 30
            天自动重置
          </p>
        )}

        {/* 总量上限 */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={totalEnabled}
            onChange={(e) => setTotalEnabled(e.target.checked)}
            className="rounded accent-blue-500"
          />
          <span className="text-xs text-slate-600 w-16 shrink-0">总量上限</span>
          {totalEnabled ? (
            <div className="flex items-center gap-1.5 flex-1">
              <input
                type="number"
                min={0}
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="如 50000"
                className="flex-1 text-xs px-2 py-1 rounded-lg border border-slate-200 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
              />
              <span className="text-[10px] text-slate-400 shrink-0">积分</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">不限</span>
          )}
        </label>
        {totalEnabled && (
          <p className="text-[10px] text-slate-400 pl-6">
            累计已用：{member.creditUsedTotal?.toLocaleString() ?? 0} 积分
          </p>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 pt-0.5">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg h-7 px-3 text-xs"
          >
            {saving ? "保存中…" : "保存"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            className="rounded-lg h-7 px-3 text-xs text-slate-500"
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}
