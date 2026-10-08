import React from "react";
import { Headphones, Minus, Send, X } from "lucide-react";
import { isLinglongRestrictedPalette } from "@/config/linglongPalette";
import {
  csDeskApi,
  type CsConversation,
  type CsMessage,
} from "@/services/csDeskApi";
import { csRealtimeClient } from "@/services/csRealtimeClient";
import { useProjectStore } from "@/stores/projectStore";
import { useLocaleText } from "@/utils/localeText";
import { cn } from "@/lib/utils";

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

const CsChatEntry: React.FC = () => {
  const { lt } = useLocaleText();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const [open, setOpen] = React.useState(false);
  const [conversation, setConversation] = React.useState<CsConversation | null>(
    null
  );
  const [messages, setMessages] = React.useState<CsMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [unread, setUnread] = React.useState(0);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  const ensureConversation = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const conv = await csDeskApi.createConversation();
      setConversation(conv);
      const msgs = await csDeskApi.listMessages(conv.id);
      setMessages(msgs);
      await csDeskApi.markRead(conv.id).catch(() => undefined);
      setUnread(0);
      csRealtimeClient.join(conv.id);
    } catch (e: any) {
      setError(e?.message || lt("无法连接客服", "Unable to connect support"));
    } finally {
      setLoading(false);
    }
  }, [lt]);

  const conversationIdRef = React.useRef<string | null>(null);
  const openRef = React.useRef(open);
  React.useEffect(() => {
    conversationIdRef.current = conversation?.id ?? null;
  }, [conversation?.id]);
  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  React.useEffect(() => {
    if (!isLinglongRestrictedPalette()) return;
    csRealtimeClient.start();
    const unsub = csRealtimeClient.subscribe((env) => {
      if (!env || typeof env !== "object") return;
      const activeId = conversationIdRef.current;
      if (env.type === "message" && env.message) {
        const msg = env.message as CsMessage;
        if (activeId && msg.conversationId === activeId) {
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
          if (!openRef.current && msg.senderRole !== "user") {
            setUnread((n) => n + 1);
          } else if (openRef.current && msg.senderRole !== "user") {
            void csDeskApi.markRead(activeId).catch(() => undefined);
          }
        } else if (!openRef.current && msg.senderRole !== "user") {
          setUnread((n) => n + 1);
        }
      }
      if (env.type === "status" && activeId && env.conversationId === activeId) {
        void csDeskApi.getMine(activeId).then(setConversation).catch(() => undefined);
      }
    });
    return () => {
      unsub();
      csRealtimeClient.stop();
    };
  }, []);

  React.useEffect(() => {
    if (open && !conversation) {
      void ensureConversation();
    }
  }, [conversation, ensureConversation, open]);

  React.useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, open]);

  if (!isLinglongRestrictedPalette()) return null;

  const handleSend = async () => {
    const text = draft.trim();
    if (!conversation || !text || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await csDeskApi.sendMessage(conversation.id, { text });
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
      setDraft("");
    } catch (e: any) {
      setError(e?.message || lt("发送失败", "Send failed"));
    } finally {
      setSending(false);
    }
  };

  const handleRespondCollab = async (
    collabId: string,
    action: "accepted" | "rejected"
  ) => {
    try {
      await csDeskApi.respondCollab(
        collabId,
        action,
        currentProjectId || undefined
      );
      if (conversation) {
        const msgs = await csDeskApi.listMessages(conversation.id);
        setMessages(msgs);
      }
    } catch (e: any) {
      setError(e?.message || lt("操作失败", "Action failed"));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-[1050] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition",
          open
            ? "bg-[#111827] text-white"
            : "bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
        )}
        aria-label={lt("客服", "Support")}
        title={lt("玲珑客服", "Linglong Support")}
      >
        {open ? <Minus className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-[1050] flex h-[min(560px,calc(100vh-140px))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between border-b border-[#EEF1F5] bg-[#2563EB] px-4 py-3 text-white">
            <div>
              <div className="text-sm font-semibold">
                {lt("玲珑客服", "Linglong Support")}
              </div>
              <div className="text-[11px] text-white/80">
                {conversation?.status === "active"
                  ? lt(
                      `接待中 · ${conversation.agent?.name || "客服"}`,
                      `Active · ${conversation.agent?.name || "Agent"}`
                    )
                  : conversation?.status === "ended"
                    ? lt("会话已结束", "Session ended")
                    : lt("排队中，客服即将接入", "Waiting for an agent")}
              </div>
            </div>
            <button
              type="button"
              className="rounded-full p-1 hover:bg-white/15"
              onClick={() => setOpen(false)}
              aria-label={lt("关闭", "Close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto bg-[#F8FAFC] px-3 py-3">
            {loading && (
              <div className="py-8 text-center text-xs text-[#9CA3AF]">
                {lt("连接中...", "Connecting...")}
              </div>
            )}
            {messages.map((msg) => {
              if (msg.type === "system") {
                return (
                  <div
                    key={msg.id}
                    className="text-center text-[11px] text-[#9CA3AF]"
                  >
                    {String(msg.content?.text || "")}
                  </div>
                );
              }
              const mine = msg.senderRole === "user";
              return (
                <div
                  key={msg.id}
                  className={cn("flex", mine ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      mine
                        ? "bg-[#2563EB] text-white"
                        : "border border-[#E5E7EB] bg-white text-[#111827]"
                    )}
                  >
                    {msg.type === "service_package" ? (
                      <div className="space-y-1">
                        <div className="text-xs opacity-80">
                          {msg.content?.tag || lt("服务包", "Package")}
                        </div>
                        <div className="font-semibold">{msg.content?.name}</div>
                        <div>
                          ¥{((msg.content?.priceCents || 0) / 100).toFixed(0)}
                        </div>
                        <div className="text-xs opacity-80">
                          {msg.content?.description}
                        </div>
                      </div>
                    ) : msg.type === "collab_request" ? (
                      <div className="space-y-2">
                        <div className="font-medium">
                          {lt("协同操作请求", "Collaboration request")}
                        </div>
                        <div className="text-xs opacity-80">
                          {msg.content?.pricePerMinute || 50}{" "}
                          {lt("元/次/分钟", "CNY / session / min")}
                        </div>
                        {msg.content?.status === "pending" ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="rounded-md bg-[#2563EB] px-2 py-1 text-xs text-white"
                              onClick={() =>
                                void handleRespondCollab(
                                  String(msg.content.collabId),
                                  "accepted"
                                )
                              }
                            >
                              {lt("同意", "Accept")}
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#374151]"
                              onClick={() =>
                                void handleRespondCollab(
                                  String(msg.content.collabId),
                                  "rejected"
                                )
                              }
                            >
                              {lt("拒绝", "Decline")}
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs opacity-70">
                            {String(msg.content?.status || "")}
                          </div>
                        )}
                      </div>
                    ) : msg.type === "attachment" ? (
                      <a
                        href={String(msg.content?.url || "#")}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {msg.content?.fileName || lt("查看附件", "Open attachment")}
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

          <div className="border-t border-[#EEF1F5] px-3 py-2">
            {error && (
              <div className="mb-1 text-[11px] text-red-500">{error}</div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={2}
                disabled={!conversation || conversation.status === "ended"}
                placeholder={lt("输入消息…", "Type a message…")}
                className="min-h-[56px] flex-1 resize-none rounded-lg border border-[#E5E7EB] px-2.5 py-2 text-sm outline-none focus:border-[#2563EB]"
              />
              <button
                type="button"
                disabled={
                  sending ||
                  !draft.trim() ||
                  !conversation ||
                  conversation.status === "ended"
                }
                onClick={() => void handleSend()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#2563EB] text-white disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CsChatEntry;
