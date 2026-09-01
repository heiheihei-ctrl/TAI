import { fetchWithAuth } from './authFetch';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
  'http://localhost:4000';

export type ChatPresetPromptItem = {
  id: string;
  category: string;
  title: string;
  content: string;
  sortOrder: number;
  isActive?: boolean;
};

export type ChatPresetPromptsData = {
  categories: string[];
  items: ChatPresetPromptItem[];
};

export async function fetchPublicPresetPrompts(): Promise<ChatPresetPromptsData> {
  const response = await fetch(`${API_BASE}/api/public/ai/preset-prompts`);
  if (!response.ok) {
    throw new Error('加载预设提示词失败');
  }
  return response.json();
}

export async function fetchAdminPresetPrompts(): Promise<ChatPresetPromptsData> {
  const response = await fetchWithAuth(`${API_BASE}/api/admin/preset-prompts`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || '加载预设提示词失败');
  }
  return response.json();
}

export async function saveAdminPresetPrompts(
  data: ChatPresetPromptsData,
): Promise<ChatPresetPromptsData> {
  const response = await fetchWithAuth(`${API_BASE}/api/admin/preset-prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || '保存预设提示词失败');
  }
  return response.json();
}
