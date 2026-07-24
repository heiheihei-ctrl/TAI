import { getAccessToken } from './authTokenStorage';
import { tokenRefreshManager } from './tokenRefreshManager';

type Listener = (env: any) => void;

/**
 * 优先直连 VITE_API_BASE_URL（与 Tanva 一致，本地即 ws://localhost:4000）。
 * 未配置时再走当前页同源，由 Vite /ws 代理转发。
 */
function resolveWsBase(): string {
  const configured =
    import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim().length > 0
      ? import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')
      : '';
  if (configured) return configured.replace(/^http/i, 'ws');
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}`;
  }
  return 'ws://localhost:4000';
}

const wsBase = resolveWsBase();

const MAX_BACKOFF_MS = 30_000;

let ws: WebSocket | null = null;
let generation = 0;
let teamId: string | null = null;
let projectId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 1_000;
let connId: string | null = null;
let resumeSeq = 0;
const listeners = new Set<Listener>();
let tokenHookInstalled = false;

function buildUrl(): string | null {
  // 允许仅靠 cookie 鉴权：无 localStorage token 也要发起 WS，否则 Network 里完全看不到连接。
  if (!teamId && !projectId) return null;
  const params = new URLSearchParams();
  const token = getAccessToken();
  if (token) params.set('token', token);
  if (teamId) params.set('teamId', teamId);
  if (projectId) params.set('projectId', projectId);
  if (resumeSeq > 0) params.set('after', String(resumeSeq));
  const qs = params.toString();
  return qs ? `${wsBase}/ws/collab?${qs}` : `${wsBase}/ws/collab`;
}

function closeSocket(): void {
  if (ws) {
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    } catch {}
    ws = null;
  }
}

function scheduleReconnect(): void {
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
    if (event !== 'token-refreshed') return;
    if (!teamId && !projectId) return;
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
      try { sock.close(); } catch {}
      return;
    }
    backoff = 1_000;
  };
  sock.onmessage = (e) => {
    if (gen !== generation) return;
    let env: any;
    try {
      env = JSON.parse(e.data);
    } catch {
      return;
    }
    if (env?.type === 'connected') connId = env.payload?.connId ?? null;
    for (const l of listeners) {
      try {
        l(env);
      } catch {}
    }
  };
  sock.onclose = () => {
    if (gen !== generation) return;
    scheduleReconnect();
  };
  sock.onerror = () => {
    try { sock.close(); } catch {}
  };
}

export const realtimeClient = {
  setContext(next: { teamId?: string | null; projectId?: string | null }): void {
    let changed = false;
    if (next.teamId !== undefined && next.teamId !== teamId) {
      teamId = next.teamId;
      changed = true;
    }
    if (next.projectId !== undefined && next.projectId !== projectId) {
      projectId = next.projectId;
      resumeSeq = 0;
      changed = true;
    }
    if (changed) connect();
  },
  refresh(): void {
    connect();
  },
  noteSeq(seq: number): void {
    if (typeof seq === 'number' && seq > resumeSeq) resumeSeq = seq;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  send(env: unknown): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(env));
      } catch {}
    }
  },
  getConnId(): string | null {
    return connId;
  },
  stop(): void {
    generation += 1;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    closeSocket();
  },
};
