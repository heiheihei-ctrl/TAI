import { fetchWithAuth } from './authFetch';
import { getApiBaseUrl } from '../utils/assetProxy';
import type { TencentAsrConfig } from './tencentRealtimeAsr';

const apiBaseUrl = () => getApiBaseUrl();

let cachedConfig: TencentAsrConfig | null = null;
let cachedConfigAt = 0;
const CONFIG_TTL_MS = 5 * 60 * 1000;

export async function fetchTencentAsrConfig(force = false): Promise<TencentAsrConfig> {
  const now = Date.now();
  if (!force && cachedConfig && now - cachedConfigAt < CONFIG_TTL_MS) {
    return cachedConfig;
  }

  const response = await fetchWithAuth(`${apiBaseUrl()}/api/ai/tencent-asr/config`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      (typeof error.message === 'string' && error.message) ||
      (Array.isArray(error.message) ? error.message.join('; ') : '') ||
      error.error ||
      `获取 ASR 配置失败 (HTTP ${response.status})`;
    throw new Error(message);
  }
  const data = (await response.json()) as TencentAsrConfig;
  if (!data?.appId || !data?.secretId) {
    throw new Error('ASR 配置不完整：缺少 appId 或 secretId');
  }
  cachedConfig = data;
  cachedConfigAt = now;
  return data;
}

export async function signTencentAsr(signStr: string): Promise<string> {
  const response = await fetchWithAuth(`${apiBaseUrl()}/api/ai/tencent-asr/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signStr }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      (typeof error.message === 'string' && error.message) ||
      (Array.isArray(error.message) ? error.message.join('; ') : '') ||
      error.error ||
      `ASR 签名失败 (HTTP ${response.status})`;
    throw new Error(message);
  }
  const data = await response.json();
  const signature = typeof data?.signature === 'string' ? data.signature : '';
  if (!signature) {
    throw new Error('ASR 签名为空');
  }
  return signature;
}
