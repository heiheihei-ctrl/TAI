import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, Copy, Crown, Shield, User, UserMinus } from "lucide-react";
import { teamApi, type TeamMember } from "@/services/teamApi";
import { teamSeatPackageApi } from "@/services/teamCreditsApi";
import { useAuthStore } from "@/stores/authStore";
import { useTeamStore } from "@/stores/teamStore";
import { copyTextToClipboard } from "@/utils/clipboard";
import { cn } from "@/lib/utils";

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
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    if (!teamId) return;
    const [m, seats] = await Promise.all([
      teamApi.getMembers(teamId),
      teamSeatPackageApi.listPackages(teamId).catch(() => null),
    ]);
    setMembers(m);
    setTotalSeats(seats?.totalSeats ?? null);
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

  const roleIcon = (role: string) => {
    if (role === "owner") return <Crown className="h-3.5 w-3.5 text-amber-500" />;
    if (role === "admin") return <Shield className="h-3.5 w-3.5 text-sky-500" />;
    return <User className="h-3.5 w-3.5 text-slate-400" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">席位管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          已占用 {members.filter((m) => !m.seatExempt).length}
          {totalSeats != null ? ` / ${totalSeats}` : ""} 席 · 企业管理员不计席 · 邀请码与角色
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
                  {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
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
                  {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
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
            return (
              <li
                key={m.userId}
                className="flex items-center gap-3 px-4 py-3"
              >
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
                    {m.role}
                    {m.seatExempt ? (
                      <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        不计席
                      </span>
                    ) : null}
                  </div>
                </div>

                {myRole === "owner" && !isSelf && m.role !== "owner" ? (
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    value={m.role}
                    onChange={async (e) => {
                      try {
                        await teamApi.updateMemberRole(
                          teamId,
                          m.userId,
                          e.target.value
                        );
                        await reload();
                      } catch (err: any) {
                        setError(err?.message || "更新角色失败");
                      }
                    }}
                  >
                    <option value="admin">admin</option>
                    <option value="member">member</option>
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
                      "rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    )}
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
