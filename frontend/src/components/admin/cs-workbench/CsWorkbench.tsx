import React from "react";
import {
  Crown,
  Paperclip,
  Send,
  Ticket,
  Users,
} from "lucide-react";
import {
  csDeskApi,
  type CsConversation,
  type CsCustomerProfile,
  type CsMessage,
  type CsQuickReply,
  type CsServicePackage,
} from "@/services/csDeskApi";
import { csRealtimeClient } from "@/services/csRealtimeClient";
import { useAuthStore } from "@/stores/authStore";
import { mergeSession } from "@/services/authApi";
import { cn } from "@/lib/utils";

type QueueTab = "waiting" | "active" | "ended";

function formatTime(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return "-";
  }
}

function displayName(conv?: CsConversation | null) {
  if (!conv?.user) return "客户";
  const name =
    conv.user.profileRealName || conv.user.name || conv.user.phone || "客户";
  const company = conv.user.profileCompany;
  return company ? `${name} · ${company}` : name;
}

function avatarText(conv?: CsConversation | null) {
  const raw = conv?.user?.profileRealName || conv?.user?.name || "?";
  return String(raw).trim().slice(0, 1) || "?";
}

function messageText(msg?: CsMessage) {
  if (!msg) return "";
  if (msg.type === "text" || msg.type === "system") {
    return String(msg.content?.text || "");
  }
  if (msg.type === "service_package") {
    return `[服务包] ${msg.content?.name || ""}`;
  }
  if (msg.type === "collab_request") {
    return String(msg.content?.text || "[协同请求]");
  }
  if (msg.type === "attachment") {
    return `[附件] ${msg.content?.fileName || msg.content?.url || ""}`;
  }
  return "";
}

const CsWorkbench: React.FC = () => {
  const authUser = useAuthStore((s) => s.user);
  const isFullAdmin = (authUser?.role || "").toLowerCase() === "admin";
  const canDispatch = Boolean(authUser?.isCsAgent);
  const [queueTab, setQueueTab] = React.useState<QueueTab>("waiting");
  const [activeScope, setActiveScope] = React.useState<"mine" | "all">("mine");
  const [items, setItems] = React.useState<CsConversation[]>([]);
  const [counts, setCounts] = React.useState({
    waiting: 0,
    active: 0,
    ended: 0,
  });
  const [onlineAgentCount, setOnlineAgentCount] = React.useState(0);
  const [myActiveCount, setMyActiveCount] = React.useState(0);
  const [presence, setPresence] = React.useState<"online" | "away" | "offline">(
    "offline"
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<CsMessage[]>([]);
  const [profile, setProfile] = React.useState<CsCustomerProfile | null>(null);
  const [history, setHistory] = React.useState<
    Array<{
      id: string;
      status: string;
      createdAt: string;
      endedAt: string | null;
      agentName: string | null;
      preview: string | null;
    }>
  >([]);
  const [quickReplies, setQuickReplies] = React.useState<CsQuickReply[]>([]);
  const [packages, setPackages] = React.useState<CsServicePackage[]>([]);
  const [onlineAgents, setOnlineAgents] = React.useState<
    Array<{ id: string; name: string | null; phone: string; activeCount: number }>
  >([]);
  const [draft, setDraft] = React.useState("");
  const [loadingList, setLoadingList] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showQuick, setShowQuick] = React.useState(false);
  const [showPackages, setShowPackages] = React.useState(false);
  const [ticketTitle, setTicketTitle] = React.useState("");
  const [showTicket, setShowTicket] = React.useState(false);
  const [showTransfer, setShowTransfer] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  const selected = React.useMemo(
    () => items.find((i) => i.id === selectedId) || null,
    [items, selectedId]
  );

  const latestCollab = React.useMemo(() => {
    const request = [...messages].reverse().find(
      (message) => message.conversationId === selectedId && message.type === "collab_request"
    );
    if (!request) return null;
    const response = [...messages].reverse().find(
      (message) => message.conversationId === selectedId &&
        message.type === "system" && message.content?.collabId === request.content?.collabId
    );
    const content = { ...request.content, ...response?.content };
    return { status: content.status as unknown, projectId: content.projectId as unknown, agentId: request.senderId };
  }, [messages, selectedId]);
  const canvasProjectId = selected?.status === "active" &&
    selected.agentId === authUser?.id && latestCollab?.agentId === authUser?.id &&
    latestCollab?.status === "accepted" && typeof latestCollab?.projectId === "string"
      ? latestCollab.projectId : null;

  const refreshList = React.useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const scope =
        queueTab === "waiting"
          ? undefined
          : queueTab === "active" || queueTab === "ended"
            ? activeScope
            : "mine";
      const result = await csDeskApi.adminList(queueTab, scope);
      // Role changes must follow database state rather than the cached login snapshot.
      if (result.viewer) {
        const current = useAuthStore.getState().user;
        if (current?.id === result.viewer.id) {
          const user = { ...current, ...result.viewer };
          mergeSession(user);
          if (current.isCsAgent !== user.isCsAgent || current.role !== user.role) {
            useAuthStore.setState({ user });
          }
        }
      }
      setItems(result.items);
      setCounts(result.counts);
      setOnlineAgentCount(result.onlineAgentCount ?? 0);
      setMyActiveCount(result.myActiveCount ?? result.counts.active);
    } catch (e: any) {
      setError(e?.message || "加载会话失败");
    } finally {
      setLoadingList(false);
    }
  }, [activeScope, queueTab]);

  const loadConversationDetail = React.useCallback(async (id: string) => {
    try {
      const [msgs, customer] = await Promise.all([
        csDeskApi.adminMessages(id),
        csDeskApi.adminCustomer(id),
      ]);
      setMessages(msgs);
      setProfile(customer.profile);
      setHistory(customer.history);
      void csDeskApi.adminMarkRead(id).catch(() => undefined);
    } catch (e: any) {
      setError(e?.message || "加载会话详情失败");
    }
  }, []);

  React.useEffect(() => {
    void refreshList();
    const timer = window.setInterval(() => void refreshList(), 15_000);
    return () => window.clearInterval(timer);
  }, [refreshList]);

  React.useEffect(() => {
    void Promise.all([
      csDeskApi.adminQuickReplies(),
      csDeskApi.adminPackages(),
      csDeskApi.adminGetPresence().catch(() => ({ status: "offline" as const })),
    ])
      .then(([qr, pkgs, presenceRes]) => {
        setQuickReplies(qr);
        setPackages(pkgs);
        setPresence(presenceRes.status || "offline");
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    csRealtimeClient.start();
    if (canDispatch) {
      void csDeskApi
        .adminSetPresence("online")
        .then(() => setPresence("online"))
        .catch(() => undefined);
    }
    const unsub = csRealtimeClient.subscribe((env) => {
      if (!env || typeof env !== "object") return;
      if (env.type === "message" && env.conversationId) {
        if (env.conversationId === selectedId && env.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === env.message.id)) return prev;
            return [...prev, env.message as CsMessage];
          });
        }
        void refreshList();
      }
      if (env.type === "status" && env.conversationId) {
        void refreshList();
        if (env.conversationId === selectedId) {
          void loadConversationDetail(env.conversationId);
        }
      }
    });
    return () => {
      unsub();
      csRealtimeClient.stop();
    };
  }, [canDispatch, loadConversationDetail, refreshList, selectedId]);

  React.useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setProfile(null);
      setHistory([]);
      csRealtimeClient.leave();
      return;
    }
    csRealtimeClient.join(selectedId);
    void loadConversationDetail(selectedId);
  }, [loadConversationDetail, selectedId]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleAccept = async () => {
    if (!selectedId) return;
    try {
      await csDeskApi.adminAccept(selectedId);
      setQueueTab("active");
      await refreshList();
      await loadConversationDetail(selectedId);
    } catch (e: any) {
      setError(e?.message || "接入失败");
    }
  };

  const handleEnd = async () => {
    if (!selectedId) return;
    try {
      await csDeskApi.adminEnd(selectedId);
      setQueueTab("ended");
      await refreshList();
      await loadConversationDetail(selectedId);
    } catch (e: any) {
      setError(e?.message || "结束失败");
    }
  };

  const handleSend = async (text?: string) => {
    const value = (text ?? draft).trim();
    if (!selectedId || !value || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await csDeskApi.adminSend(selectedId, { text: value });
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
      if (!text) setDraft("");
      setShowQuick(false);
      void refreshList();
    } catch (e: any) {
      setError(e?.message || "发送失败");
    } finally {
      setSending(false);
    }
  };

  const handleRecommend = async (packageId: string) => {
    if (!selectedId) return;
    try {
      const msg = await csDeskApi.adminRecommend(selectedId, packageId);
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
      setShowPackages(false);
    } catch (e: any) {
      setError(e?.message || "推荐失败");
    }
  };

  const handleCollab = async () => {
    if (!selectedId) return;
    try {
      await csDeskApi.adminCreateCollab(selectedId, { pricePerMinute: 50 });
      await loadConversationDetail(selectedId);
    } catch (e: any) {
      setError(e?.message || "发起协同失败");
    }
  };

  const handleTogglePresence = async () => {
    const next = presence === "online" ? "away" : "online";
    try {
      await csDeskApi.adminSetPresence(next);
      setPresence(next);
    } catch (e: any) {
      setError(e?.message || "更新在线状态失败");
    }
  };

  const openTransfer = async () => {
    try {
      const agents = await csDeskApi.adminOnlineAgents();
      setOnlineAgents(agents);
      setShowTransfer(true);
    } catch (e: any) {
      setError(e?.message || "加载在线客服失败");
    }
  };

  const handleTransfer = async (toAgentId: string) => {
    if (!selectedId) return;
    try {
      await csDeskApi.adminTransfer(selectedId, toAgentId);
      setShowTransfer(false);
      setSelectedId(null);
      await refreshList();
    } catch (e: any) {
      setError(e?.message || "转接失败");
    }
  };

  const handleTicket = async () => {
    if (!selectedId || !ticketTitle.trim()) return;
    try {
      await csDeskApi.adminCreateTicket(selectedId, ticketTitle.trim());
      setTicketTitle("");
      setShowTicket(false);
      await loadConversationDetail(selectedId);
    } catch (e: any) {
      setError(e?.message || "创建工单失败");
    }
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore
    }
  };

  const queueTabs: Array<{ id: QueueTab; label: string; count: number }> = [
    { id: "waiting", label: "待接入", count: counts.waiting },
    { id: "active", label: "进行中", count: counts.active },
    { id: "ended", label: "已结束", count: counts.ended },
  ];

  return (
    <div className="flex h-[calc(100vh-88px)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EEF1F5] px-4 py-2 text-xs text-[#4B5563]">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            在线客服 <strong className="text-[#111827]">{onlineAgentCount}</strong>
          </span>
          <span>
            我的接待中 <strong className="text-[#111827]">{myActiveCount}</strong>
          </span>
          {(queueTab === "active" || queueTab === "ended") && isFullAdmin && (
            <div className="flex items-center gap-1 rounded-md border border-[#E5E7EB] p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded px-2 py-0.5",
                  activeScope === "mine" ? "bg-[#EFF6FF] text-[#2563EB]" : ""
                )}
                onClick={() => setActiveScope("mine")}
              >
                我的
              </button>
              <button
                type="button"
                className={cn(
                  "rounded px-2 py-0.5",
                  activeScope === "all" ? "bg-[#EFF6FF] text-[#2563EB]" : ""
                )}
                onClick={() => setActiveScope("all")}
              >
                全部
              </button>
            </div>
          )}
        </div>
        {canDispatch ? (
          <button
            type="button"
            onClick={() => void handleTogglePresence()}
            className={cn(
              "rounded-full px-3 py-1 font-medium",
              presence === "online"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            )}
          >
            {presence === "online" ? "接待中（点此暂离）" : "暂离（点此接待）"}
          </button>
        ) : (
          <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-500">
            未开启客服身份（仅可查看）
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
      {/* Left queue */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-[#EEF1F5]">
        <div className="flex gap-1 border-b border-[#EEF1F5] px-3 pt-3">
          {queueTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setQueueTab(tab.id)}
              className={cn(
                "-mb-px border-b-2 px-2 pb-2 text-xs font-medium transition",
                queueTab === tab.id
                  ? "border-[#2563EB] text-[#2563EB]"
                  : "border-transparent text-[#6B7280] hover:text-[#374151]"
              )}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingList && items.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-[#9CA3AF]">
              加载中...
            </div>
          ) : items.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-[#9CA3AF]">
              暂无会话
            </div>
          ) : (
            items.map((item) => {
              const active = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "mb-1 flex w-full gap-2 rounded-lg border px-2.5 py-2 text-left transition",
                    active
                      ? "border-[#93C5FD] bg-[#EFF6FF]"
                      : "border-transparent hover:bg-[#F8FAFC]"
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-sm font-semibold text-[#1D4ED8]">
                    {avatarText(item)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="truncate text-sm font-medium text-[#111827]">
                        {displayName(item)}
                      </div>
                      <div className="shrink-0 text-[11px] text-[#9CA3AF]">
                        {formatTime(item.lastMessageAt)}
                      </div>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      {item.unreadAgent > 0 && (
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] text-white">
                          {item.unreadAgent}
                        </span>
                      )}
                      <span className="truncate text-xs text-[#6B7280]">
                        {messageText(item.lastMessage)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-[#EEF1F5] px-3 py-2 text-xs text-[#6B7280]">
          共 {items.length} 个会话
        </div>
      </aside>

      {/* Center chat */}
      <section className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-[#EEF1F5] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[#111827]">
                  {displayName(selected)}
                </div>
                <div className="mt-0.5 text-xs text-[#6B7280]">
                  接待客服: {selected.agent?.name || "未接入"} · 状态:{" "}
                  {selected.status === "waiting"
                    ? "待接入"
                    : selected.status === "active"
                      ? "进行中"
                      : "已结束"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selected.status === "waiting" && canDispatch && (
                  <button
                    type="button"
                    onClick={() => void handleAccept()}
                    className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1D4ED8]"
                  >
                    接入
                  </button>
                )}
                {selected.status === "active" && canDispatch && (
                  <button
                    type="button"
                    onClick={() => void openTransfer()}
                    className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs text-[#4B5563] hover:bg-[#F9FAFB]"
                  >
                    转接
                  </button>
                )}
                {selected.status === "active" && latestCollab && canDispatch && (
                  <button
                    type="button"
                    disabled={!canvasProjectId}
                    title={canvasProjectId ? "打开用户授权的画布" : "等待用户同意协同并选择画布"}
                    onClick={() => {
                      if (canvasProjectId) window.open(
                        `/app?projectId=${encodeURIComponent(canvasProjectId)}`,
                        "_blank", "noopener,noreferrer"
                      );
                    }}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    进入画布
                  </button>
                )}
                {selected.status !== "ended" && (canDispatch || isFullAdmin) && (
                  <button
                    type="button"
                    onClick={() => void handleEnd()}
                    className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs text-[#4B5563] hover:bg-[#F9FAFB]"
                  >
                    结束会话
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-[#F8FAFC] px-4 py-4">
              {messages.map((msg) => {
                if (msg.type === "system") {
                  return (
                    <div
                      key={msg.id}
                      className="text-center text-xs text-[#9CA3AF]"
                    >
                      {String(msg.content?.text || "")}
                    </div>
                  );
                }
                const mine = msg.senderRole === "agent";
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      mine ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                        mine
                          ? "bg-[#2563EB] text-white"
                          : "bg-white text-[#111827] border border-[#E5E7EB]"
                      )}
                    >
                      {msg.type === "service_package" ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-xs opacity-90">
                            <Crown className="h-3 w-3" />
                            {msg.content?.tag || "服务包"}
                          </div>
                          <div className="font-semibold">
                            {msg.content?.name}
                          </div>
                          <div className={mine ? "text-white/90" : "text-[#6B7280]"}>
                            ¥{((msg.content?.priceCents || 0) / 100).toFixed(0)}
                          </div>
                          <div className="text-xs opacity-90">
                            {msg.content?.description}
                          </div>
                        </div>
                      ) : msg.type === "collab_request" ? (
                        <div className="space-y-1">
                          <div className="font-medium">协同操作请求</div>
                          <div className="text-xs opacity-90">
                            {msg.content?.pricePerMinute || 50} 元/次/分钟
                          </div>
                          <div className="text-xs opacity-80">
                            状态: {msg.content?.status || "pending"}
                          </div>
                        </div>
                      ) : msg.type === "attachment" ? (
                        <a
                          href={String(msg.content?.url || "#")}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {msg.content?.fileName || "查看附件"}
                        </a>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">
                          {String(msg.content?.text || "")}
                        </div>
                      )}
                      <div
                        className={cn(
                          "mt-1 text-[10px]",
                          mine ? "text-white/70" : "text-[#9CA3AF]"
                        )}
                      >
                        {formatTime(msg.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {selected.status !== "ended" && (
              <div className="border-t border-[#EEF1F5] px-4 py-3">
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuick((v) => !v);
                      setShowPackages(false);
                    }}
                    className="rounded-md border border-[#E5E7EB] px-2.5 py-1 text-xs text-[#4B5563] hover:bg-[#F9FAFB]"
                  >
                    快捷回复
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPackages((v) => !v);
                      setShowQuick(false);
                    }}
                    className="rounded-md border border-[#E5E7EB] px-2.5 py-1 text-xs text-[#4B5563] hover:bg-[#F9FAFB]"
                  >
                    推荐服务包
                  </button>
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E5E7EB] px-2.5 py-1 text-xs text-[#4B5563] hover:bg-[#F9FAFB]">
                    <Paperclip className="h-3.5 w-3.5" />
                    附件
                    <input
                      type="file"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file || !selectedId) return;
                        try {
                          // Reuse existing upload endpoint pattern via object URL fallback notice
                          const form = new FormData();
                          form.append("file", file);
                          form.append("dir", "uploads/cs/");
                          const API_BASE =
                            (import.meta.env.VITE_API_BASE_URL as string) ||
                            "http://localhost:4000";
                          const { fetchWithAuth } = await import(
                            "@/services/authFetch"
                          );
                          const res = await fetchWithAuth(
                            `${API_BASE.replace(/\/+$/, "")}/api/uploads/file`,
                            { method: "POST", body: form }
                          );
                          if (!res.ok) throw new Error("上传失败");
                          const data = await res.json();
                          const url = data?.url || data?.publicUrl || data?.key;
                          if (!url) throw new Error("上传未返回地址");
                          const msg = await csDeskApi.adminSend(selectedId, {
                            type: "attachment",
                            url: String(url),
                            fileName: file.name,
                            mimeType: file.type,
                          });
                          setMessages((prev) =>
                            prev.some((m) => m.id === msg.id)
                              ? prev
                              : [...prev, msg]
                          );
                        } catch (err: any) {
                          setError(err?.message || "附件发送失败");
                        }
                      }}
                    />
                  </label>
                </div>
                {showQuick && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {quickReplies.map((qr) => (
                      <button
                        key={qr.id}
                        type="button"
                        onClick={() => void handleSend(qr.body)}
                        className="rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-1 text-xs text-[#1D4ED8]"
                      >
                        {qr.title}
                      </button>
                    ))}
                  </div>
                )}
                {showPackages && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {packages.map((pkg) => (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => void handleRecommend(pkg.id)}
                        className="rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-1 text-xs text-[#B45309]"
                      >
                        {pkg.name} ¥{(pkg.priceCents / 100).toFixed(0)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    rows={3}
                    placeholder="输入消息，Ctrl+Enter 发送，Enter 换行"
                    className="min-h-[72px] flex-1 resize-none rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                    disabled={selected.status === "waiting"}
                  />
                  <button
                    type="button"
                    disabled={
                      sending ||
                      !draft.trim() ||
                      selected.status === "waiting"
                    }
                    onClick={() => void handleSend()}
                    className="inline-flex h-10 items-center gap-1 rounded-lg bg-[#2563EB] px-4 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    发送
                  </button>
                </div>
                {selected.status === "waiting" && (
                  <div className="mt-2 text-xs text-[#9CA3AF]">
                    请先点击「接入」再发送消息
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-sm text-[#9CA3AF]">
            <Users className="mb-2 h-8 w-8 opacity-40" />
            选择左侧会话开始接待
          </div>
        )}
        {error && (
          <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
            {error}
          </div>
        )}
      </section>

      {/* Right customer */}
      <aside className="flex w-[320px] shrink-0 flex-col border-l border-[#EEF1F5] bg-white">
        {profile ? (
          <>
            <div className="border-b border-[#EEF1F5] px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#DBEAFE] text-lg font-semibold text-[#1D4ED8]">
                  {(profile.profileRealName || profile.name || "?")
                    .trim()
                    .slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#111827]">
                    {profile.profileRealName || profile.name || "客户"}
                  </div>
                  <div className="truncate text-xs text-[#6B7280]">
                    {profile.profileCompany || "未填写公司"}
                  </div>
                  {profile.membershipPlanName && (
                    <span className="mt-1 inline-flex rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] text-[#2563EB]">
                      {profile.membershipPlanName}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 space-y-2 text-xs">
                {[
                  { label: "手机", value: profile.phone },
                  { label: "邮箱", value: profile.email || "-" },
                  {
                    label: "注册时间",
                    value: formatDateTime(profile.createdAt),
                  },
                  {
                    label: "积分余额",
                    value: String(profile.creditBalance),
                  },
                  {
                    label: "会员到期",
                    value: formatDateTime(profile.membershipExpiresAt),
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-[#6B7280]">{row.label}</span>
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-[#111827]">
                        {row.value}
                      </span>
                      {row.value && row.value !== "-" && (
                        <button
                          type="button"
                          className="text-[#2563EB]"
                          onClick={() => void copyText(String(row.value))}
                        >
                          复制
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleCollab()}
                  disabled={!selected || selected.status !== "active"}
                  className="rounded-lg bg-[#2563EB] px-2 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  发起协同
                </button>
                <button
                  type="button"
                  onClick={() => setShowTicket((v) => !v)}
                  disabled={!selected}
                  className="rounded-lg border border-[#E5E7EB] px-2 py-2 text-xs text-[#374151] disabled:opacity-50"
                >
                  创建工单
                </button>
              </div>
              {showTicket && (
                <div className="mt-2 space-y-2">
                  <input
                    value={ticketTitle}
                    onChange={(e) => setTicketTitle(e.target.value)}
                    placeholder="工单标题"
                    className="h-9 w-full rounded-md border border-[#E5E7EB] px-2 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleTicket()}
                    className="inline-flex items-center gap-1 rounded-md bg-[#111827] px-2.5 py-1.5 text-xs text-white"
                  >
                    <Ticket className="h-3.5 w-3.5" />
                    提交工单
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="mb-2 text-xs font-semibold text-[#374151]">
                服务记录
              </div>
              <div className="space-y-3">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="border-l-2 border-[#DBEAFE] pl-3 text-xs"
                  >
                    <div className="text-[#111827]">
                      {formatDateTime(h.createdAt)}
                    </div>
                    <div className="text-[#6B7280]">
                      {h.agentName || "未接入"} · {h.status}
                    </div>
                    {h.preview && (
                      <div className="mt-0.5 truncate text-[#9CA3AF]">
                        {h.preview}
                      </div>
                    )}
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="text-xs text-[#9CA3AF]">暂无记录</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-[#9CA3AF]">
            客户信息
          </div>
        )}
      </aside>
      </div>

      {showTransfer && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#111827]">转接给在线客服</h3>
              <button
                type="button"
                className="text-xs text-[#6B7280]"
                onClick={() => setShowTransfer(false)}
              >
                关闭
              </button>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {onlineAgents.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#9CA3AF]">
                  暂无其他在线客服
                </div>
              ) : (
                onlineAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => void handleTransfer(agent.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-[#E5E7EB] px-3 py-2 text-left text-sm hover:bg-[#F8FAFC]"
                  >
                    <span>
                      {agent.name || agent.phone}
                      <span className="ml-2 text-xs text-[#9CA3AF]">
                        {agent.phone}
                      </span>
                    </span>
                    <span className="text-xs text-[#6B7280]">
                      接待中 {agent.activeCount}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CsWorkbench;
