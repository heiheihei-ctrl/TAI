import { useContext, useEffect, useState } from "react";
import { CsCanvasContext } from "./CsCanvasContext";
import { useAuthStore } from "@/stores/authStore";
import { csDeskApi } from "@/services/csDeskApi";
import SmartImage from "@/components/ui/SmartImage";
import { useNavigate } from "react-router-dom";

export function CsCanvasSessionBanner() {
  const session = useContext(CsCanvasContext);
  const agent = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session]);
  if (!session) return null;
  const start = session.startedAt ? Date.parse(session.startedAt) : NaN;
  const seconds = Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : null;
  const elapsed = seconds === null ? "暂无计时信息" : [
    ...(seconds >= 3600 ? [Math.floor(seconds / 3600)] : []), Math.floor(seconds / 60) % 60, seconds % 60,
  ].map((value) => String(value).padStart(2, "0")).join(":");
  const customer = session.customer;
  const customerName = customer.profileRealName || customer.name || customer.phone || "客户";
  const endCollab = async () => {
    if (ending) return;
    setEnding(true);
    setError("");
    try {
      await csDeskApi.adminEndCollab(session.conversationId, session.collabId);
      navigate("/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "结束协同失败，请重试");
      setEnding(false);
    }
  };
  return <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4 max-xl:top-[72px]">
    <div className="pointer-events-auto relative flex h-[46px] w-[420px] max-w-full items-center gap-3 rounded-full border border-slate-200/80 bg-white/95 px-2 shadow-[0_3px_16px_rgba(15,23,42,0.10)] backdrop-blur-md">
      <div className="flex shrink-0 -space-x-2" aria-label="协同成员">
        {[{name: customerName, avatar: customer.avatarUrl, color: "bg-sky-400"}, {name: agent?.name || "客服", avatar: agent?.avatarUrl, color: "bg-orange-400"}].map((member, index) => (
          <span key={index} title={`${index === 0 ? "客户" : "客服"}：${member.name}`} className={`relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white text-xs font-medium text-white ${member.color}`}>
            {member.avatar ? <SmartImage src={member.avatar} alt={member.name} className="h-full w-full object-cover" placeholder={member.name.slice(0, 1)} /> : member.name.slice(0, 1)}
          </span>
        ))}
      </div>
      <span className="shrink-0 text-xs font-medium text-slate-700">协同操作中</span>
      <strong className="flex-1 text-center font-mono text-sm font-medium tabular-nums text-orange-500" aria-label="协同时长">{elapsed}</strong>
      <button type="button" disabled={ending} onClick={() => void endCollab()} className="h-8 shrink-0 rounded-full bg-orange-500 px-3 text-xs font-medium text-white transition hover:bg-orange-600 disabled:opacity-60">{ending ? "正在结束…" : "结束协同"}</button>
      {error && <p role="alert" className="absolute inset-x-0 top-full mt-2 rounded-xl border border-red-100 bg-white p-3 text-xs text-red-600 shadow-sm">{error}</p>}
    </div>
  </div>;
}
