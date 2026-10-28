import { fetchWithAuth } from './authFetch';
import { getApiBaseUrl } from '@/utils/assetProxy';
import { readVisualSnapshots } from '@/utils/visualAgentEvents';

export type VisualArtifact = { id: string; filename: string; mimeType: string; key: string; url: string };
export type VisualEvent = { id?: string; type: string; text?: string; name?: string; isError?: boolean };
export type VisualTurn = { id: string; requestId: string; prompt: string; referenceUrls: string[]; status: string; events: VisualEvent[]; artifacts: VisualArtifact[]; error: string | null; createdAt: string };
export type VisualSession = { id: string; title: string; projectId: string; activeTurnId: string | null; closing?: boolean; turns: VisualTurn[] };
export type VisualSessionSummary = Pick<VisualSession, 'id' | 'title' | 'projectId' | 'activeTurnId'>;
export type VisualConfig = { available: boolean; reason: string | null; creditsPerTurn: number | null };

const base = () => `${getApiBaseUrl()}/api/ai/visual-agent`;
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetchWithAuth(`${base()}${path}`, { method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(Array.isArray(error.message) ? error.message.join('；') : error.message || `请求失败 (${response.status})`);
  }
  return response.json();
}

export const visualAgentApi = {
  config: () => request<VisualConfig>('/config'),
  list: (projectId: string) => request<VisualSessionSummary[]>(`/sessions?projectId=${encodeURIComponent(projectId)}`),
  create: (projectId: string, title: string) => request<VisualSession>('/sessions', 'POST', { projectId, title }),
  get: (id: string) => request<VisualSession>(`/sessions/${encodeURIComponent(id)}`),
  send: (id: string, body: { prompt: string; requestId: string; referenceUrls: string[] }) => request<VisualTurn>(`/sessions/${encodeURIComponent(id)}/messages`, 'POST', body),
  interrupt: (id: string) => request(`/sessions/${encodeURIComponent(id)}/interrupt`, 'POST'),
  sync: (id: string) => request(`/sessions/${encodeURIComponent(id)}/sync`, 'POST'),
  remove: (id: string) => request(`/sessions/${encodeURIComponent(id)}`, 'DELETE'),
  async subscribe(id: string, signal: AbortSignal, onSnapshot: (snapshot: VisualSession) => void) {
    const response = await fetchWithAuth(`${base()}/sessions/${encodeURIComponent(id)}/events`, { signal, headers: { Accept: 'text/event-stream' } });
    if (!response.ok || !response.body) throw new Error('创作状态连接失败');
    await readVisualSnapshots(response.body, signal, snapshot => onSnapshot(snapshot as VisualSession));
  },
};
