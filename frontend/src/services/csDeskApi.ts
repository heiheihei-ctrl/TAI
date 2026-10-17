import { fetchWithAuth } from "./authFetch";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  "http://localhost:4000";

const buildUrl = (path: string) => {
  const base = API_BASE.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${base}/${p}`;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(buildUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as any).message || "请求失败");
  }
  return response.json() as Promise<T>;
}

export type CsConversationStatus = "waiting" | "active" | "ended";

export type CsMessage = {
  id: string;
  conversationId: string;
  senderRole: "user" | "agent" | "system";
  senderId: string | null;
  type: "text" | "service_package" | "collab_request" | "attachment" | "system";
  content: Record<string, any>;
  readAt: string | null;
  createdAt: string;
};

export type CsConversation = {
  id: string;
  userId: string;
  agentId: string | null;
  status: CsConversationStatus;
  lastMessageAt: string;
  unreadUser: number;
  unreadAgent: number;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string | null;
    phone: string;
    avatarUrl: string | null;
    profileCompany: string | null;
    profileRealName: string | null;
    profileEmail: string | null;
    email: string | null;
  };
  agent?: { id: string; name: string | null; avatarUrl: string | null } | null;
  lastMessage?: CsMessage;
};

export type CsCustomerProfile = {
  id: string;
  name: string | null;
  profileRealName: string | null;
  phone: string;
  email: string | null;
  profileCompany: string | null;
  avatarUrl: string | null;
  createdAt: string;
  creditBalance: number;
  membershipPlanName: string | null;
  membershipExpiresAt: string | null;
};

export type CsCanvasTarget = {
  projectId: string;
  conversationId: string;
  customer: CsCustomerProfile;
  collabId: string;
  startedAt: string | null;
};

export type CsQuickReply = {
  id: string;
  title: string;
  body: string;
  sortOrder: number;
};

export type CsServicePackage = {
  id: string;
  name: string;
  priceCents: number;
  description: string | null;
  tag: string | null;
};

export const csDeskApi = {
  createConversation: (initialMessage?: string) =>
    request<CsConversation>("api/cs/conversations", {
      method: "POST",
      body: JSON.stringify({ initialMessage }),
    }),

  listMine: () => request<CsConversation[]>("api/cs/conversations/mine"),

  getMine: (id: string) =>
    request<CsConversation>(`api/cs/conversations/${encodeURIComponent(id)}`),

  listMessages: (id: string) =>
    request<CsMessage[]>(
      `api/cs/conversations/${encodeURIComponent(id)}/messages`
    ),

  sendMessage: (
    id: string,
    body: {
      type?: "text" | "attachment";
      text?: string;
      url?: string;
      fileName?: string;
      mimeType?: string;
    }
  ) =>
    request<CsMessage>(
      `api/cs/conversations/${encodeURIComponent(id)}/messages`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  markRead: (id: string) =>
    request<{ ok: boolean }>(
      `api/cs/conversations/${encodeURIComponent(id)}/read`,
      { method: "POST", body: "{}" }
    ),

  respondCollab: (
    collabId: string,
    action: "accepted" | "rejected",
    projectId?: string
  ) =>
    request<any>(`api/cs/collab/${encodeURIComponent(collabId)}/respond`, {
      method: "POST",
      body: JSON.stringify({ action, projectId }),
    }),

  adminList: (status?: string, scope?: "mine" | "all") => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (scope) params.set("scope", scope);
    const qs = params.toString();
    return request<{
      items: CsConversation[];
      counts: { waiting: number; active: number; ended: number };
      onlineAgentCount?: number;
      myActiveCount?: number;
      viewer?: { id: string; role: string; isCsAgent: boolean };
    }>(`api/cs/admin/conversations${qs ? `?${qs}` : ""}`);
  },

  adminGet: (id: string) =>
    request<CsConversation>(
      `api/cs/admin/conversations/${encodeURIComponent(id)}`
    ),

  adminMessages: (id: string) =>
    request<CsMessage[]>(
      `api/cs/admin/conversations/${encodeURIComponent(id)}/messages`
    ),

  adminAccept: (id: string) =>
    request<CsConversation>(
      `api/cs/admin/conversations/${encodeURIComponent(id)}/accept`,
      { method: "POST", body: "{}" }
    ),

  adminEnd: (id: string) =>
    request<CsConversation>(
      `api/cs/admin/conversations/${encodeURIComponent(id)}/end`,
      { method: "POST", body: "{}" }
    ),

  adminSend: (
    id: string,
    body: {
      type?: "text" | "attachment";
      text?: string;
      url?: string;
      fileName?: string;
      mimeType?: string;
    }
  ) =>
    request<CsMessage>(
      `api/cs/admin/conversations/${encodeURIComponent(id)}/messages`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  adminMarkRead: (id: string) =>
    request<{ ok: boolean }>(
      `api/cs/admin/conversations/${encodeURIComponent(id)}/read`,
      { method: "POST", body: "{}" }
    ),

  adminRecommend: (id: string, packageId: string) =>
    request<CsMessage>(
      `api/cs/admin/conversations/${encodeURIComponent(id)}/recommend-package`,
      { method: "POST", body: JSON.stringify({ packageId }) }
    ),

  adminCreateTicket: (id: string, title: string, note?: string) =>
    request<any>(
      `api/cs/admin/conversations/${encodeURIComponent(id)}/tickets`,
      { method: "POST", body: JSON.stringify({ title, note }) }
    ),

  adminCreateCollab: (
    id: string,
    opts?: { projectId?: string; pricePerMinute?: number }
  ) =>
    request<any>(
      `api/cs/admin/conversations/${encodeURIComponent(id)}/collab`,
      { method: "POST", body: JSON.stringify(opts || {}) }
    ),

  adminCanvasTarget: (id: string) => request<CsCanvasTarget>(
    `api/cs/admin/conversations/${encodeURIComponent(id)}/canvas-target`
  ),

  adminEndCollab: (id: string, collabId: string) => request<{ ok: boolean }>(
    `api/cs/admin/conversations/${encodeURIComponent(id)}/collab/${encodeURIComponent(collabId)}/end`,
    { method: "POST", body: "{}" }
  ),

  adminCustomer: (id: string) =>
    request<{
      profile: CsCustomerProfile;
      history: Array<{
        id: string;
        status: string;
        createdAt: string;
        endedAt: string | null;
        agentName: string | null;
        preview: string | null;
      }>;
    }>(`api/cs/admin/conversations/${encodeURIComponent(id)}/customer`),

  adminQuickReplies: () =>
    request<CsQuickReply[]>("api/cs/admin/quick-replies"),

  adminPackages: () =>
    request<CsServicePackage[]>("api/cs/admin/service-packages"),

  adminTransfer: (id: string, toAgentId: string) =>
    request<CsConversation>(
      `api/cs/admin/conversations/${encodeURIComponent(id)}/transfer`,
      { method: "POST", body: JSON.stringify({ toAgentId }) }
    ),

  adminGetPresence: () =>
    request<{ status: "online" | "away" | "offline" }>("api/cs/admin/presence"),

  adminSetPresence: (status: "online" | "away" | "offline") =>
    request<{ userId: string; status: string }>("api/cs/admin/presence", {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  adminOnlineAgents: () =>
    request<
      Array<{
        id: string;
        name: string | null;
        phone: string;
        activeCount: number;
      }>
    >("api/cs/admin/online-agents"),
};
