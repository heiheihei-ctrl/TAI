import { getAccessToken } from "./authTokenStorage";
import { tokenRefreshManager } from "./tokenRefreshManager";

type Listener = (env: any) => void;

function sameOriginWsBase(): string {
  if (typeof window === "undefined") return "ws://localhost:4000";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}`;
}

function toWsBase(httpOrWsUrl: string): string {
  const trimmed = String(httpOrWsUrl || "").trim();
  if (!trimmed || trimmed === "/" || (trimmed.startsWith("/") && !trimmed.startsWith("//"))) {
    return sameOriginWsBase();
  }
  let candidate = trimmed.replace(/\/+$/, "");
  if (/^https:/i.test(candidate)) candidate = candidate.replace(/^https:/i, "wss:");
  else if (/^http:/i.test(candidate)) candidate = candidate.replace(/^http:/i, "ws:");
  else if (!/^wss?:/i.test(candidate)) {
    const proto =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss"
        : "ws";
    candidate = `${proto}://${candidate.replace(/^\/+/, "")}`;
  }
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    try {
      const parsed = new URL(candidate.replace(/^ws/i, "http"));
      if (parsed.hostname === window.location.hostname && /^ws:/i.test(candidate)) {
        candidate = candidate.replace(/^ws:/i, "wss:");
      }
    } catch {
      // ignore
    }
  }
  return candidate;
}

function resolveWsBase(): string {
  const wsOverride =
    typeof import.meta.env.VITE_WS_BASE_URL === "string"
      ? import.meta.env.VITE_WS_BASE_URL.trim()
      : "";
  if (wsOverride) return toWsBase(wsOverride);
  const apiConfigured =
    import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim().length > 0
      ? import.meta.env.VITE_API_BASE_URL.trim()
      : "";
  if (apiConfigured) return toWsBase(apiConfigured);
  return sameOriginWsBase();
}

const MAX_BACKOFF_MS = 30_000;

let ws: WebSocket | null = null;
let generation = 0;
let enabled = false;
let activeConversationId: string | null = null;
let canvasProjectId: string | null = null;
let canvasConversationId: string | null = null;
let canvasReady = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 1_000;
const listeners = new Set<Listener>();
let tokenHookInstalled = false;

function buildUrl(): string | null {
  if (!enabled) return null;
  const wsBase = resolveWsBase();
  const params = new URLSearchParams();
  const token = getAccessToken();
  if (token) params.set("token", token);
  const qs = params.toString();
  return qs ? `${wsBase}/ws/cs?${qs}` : `${wsBase}/ws/cs`;
}

function closeSocket(): void {
  canvasReady = false;
  if (ws) {
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    } catch {
      // ignore
    }
    ws = null;
  }
}

function scheduleReconnect(): void {
  if (!enabled) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = backoff;
  backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function ensureTokenRefreshHook(): void {
  if (tokenHookInstalled) return;
  tokenHookInstalled = true;
  tokenRefreshManager.subscribe((event) => {
    if (event !== "token-refreshed") return;
    if (!enabled) return;
    connect();
  });
}

function connect(): void {
  ensureTokenRefreshHook();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const url = buildUrl();
  closeSocket();
  if (!url) return;
  const gen = ++generation;
  const sock = new WebSocket(url);
  ws = sock;
  sock.onopen = () => {
    if (gen !== generation) {
      try {
        sock.close();
      } catch {
        // ignore
      }
      return;
    }
    backoff = 1_000;
    if (activeConversationId) {
      try {
        sock.send(
          JSON.stringify({ type: "join", conversationId: activeConversationId })
        );
      } catch {
        // ignore
      }
    }
  };
  sock.onmessage = (e) => {
    if (gen !== generation) return;
    let env: any;
    try {
      env = JSON.parse(e.data);
    } catch {
      return;
    }
    if (env.type === "ready") {
      sock.send(JSON.stringify({ type: "canvas_presence", projectId: canvasProjectId, conversationId: canvasConversationId }));
    }
    if (env.type === "canvas_ready") canvasReady = Boolean(canvasProjectId && env.projectId === canvasProjectId);
    if (env.type === "canvas_error") canvasReady = false;
    for (const l of listeners) {
      try {
        l(env);
      } catch {
        // ignore
      }
    }
  };
  sock.onclose = () => {
    if (gen !== generation) return;
    canvasReady = false;
    for (const listener of listeners) {
      try {
        listener({ type: "canvas_error", message: "实时连接已断开，正在重连；若持续出现，请检查后端服务与登录状态" });
      } catch {
        // A failed subscriber must not interrupt reconnection.
      }
    }
    scheduleReconnect();
  };
  sock.onerror = () => {
    try {
      sock.close();
    } catch {
      // ignore
    }
  };
}

export const csRealtimeClient = {
  start(): void {
    if (enabled && ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    enabled = true;
    connect();
  },
  stop(): void {
    enabled = false;
    activeConversationId = null;
    generation += 1;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    closeSocket();
  },
  join(conversationId: string | null): void {
    activeConversationId = conversationId;
    if (!enabled) return;
    if (ws && ws.readyState === WebSocket.OPEN && conversationId) {
      try {
        ws.send(JSON.stringify({ type: "join", conversationId }));
      } catch {
        // ignore
      }
    } else if (!ws || ws.readyState !== WebSocket.CONNECTING) {
      connect();
    }
  },
  leave(conversationId?: string): void {
    const id = conversationId || activeConversationId;
    if (ws && ws.readyState === WebSocket.OPEN && id) {
      try {
        ws.send(JSON.stringify({ type: "leave", conversationId: id }));
      } catch {
        // ignore
      }
    }
    if (!conversationId || conversationId === activeConversationId) {
      activeConversationId = null;
    }
  },
  send(env: unknown): void {
    if (typeof env === "object" && env !== null && "type" in env && env.type === "canvas_cursor" && !canvasReady) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(env));
      } catch {
        // ignore
      }
    }
  },
  setCanvasProject(projectId: string | null, conversationId: string | null = null): void {
    canvasReady = false;
    canvasProjectId = projectId;
    canvasConversationId = conversationId;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'canvas_presence', projectId, conversationId }));
    }
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
