import axios, { AxiosRequestConfig, AxiosResponse, Method } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

const DEFAULT_TOAPIS_BASE = 'https://toapis.com/v1';

let cachedProxyUrl: string | null | undefined;
let cachedAgent: SocksProxyAgent | null = null;

export function getToapisApiBaseUrl(): string {
  const raw = process.env.TOAPIS_API_BASE_URL || process.env.TOAPIS_API_ENDPOINT || DEFAULT_TOAPIS_BASE;
  return String(raw).trim().replace(/\/+$/, '');
}

export function getToapisApiKey(): string | null {
  const token = process.env.TOAPIS_TOKEN?.trim();
  return token || null;
}

/** 将 ToAPIs HTTP 错误转为可读文案（含 quota / 模型路由等常见码） */
export function formatToapisHttpError(
  status: number,
  statusText: string,
  body: unknown,
): string {
  const errorData =
    typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const normalized = errorData.toLowerCase();

  if (
    normalized.includes('quota_not_enough') ||
    normalized.includes('user quota is not enough') ||
    normalized.includes('insufficient_quota')
  ) {
    return 'ToAPIs 账户余额或配额不足，请在 ToAPIs 控制台充值后再试（与应用内签到积分无关）';
  }
  if (
    /mirror|10\s*mb|10mb|reference image|must not be larger/.test(normalized)
  ) {
    return `参考图不符合 ToAPIs 要求（≤10MB 且可公网访问）: ${errorData}`;
  }
  if (
    normalized.includes('deadline exceeded') ||
    normalized.includes('context deadline') ||
    normalized.includes('timeout')
  ) {
    return `ToAPIs 上游超时，请稍后重试: ${errorData}`;
  }
  if (normalized.includes('no images in')) {
    return `ToAPIs 未返回有效图片: ${errorData}`;
  }
  if (
    normalized.includes('channelcapability') ||
    normalized.includes('model_not_found')
  ) {
    return `ToAPIs 模型未开通或未配置 SKU 路由: ${errorData}`;
  }

  return `ToAPIs 请求失败: ${status} ${statusText} - ${errorData}`;
}

export function buildToapisUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getToapisApiBaseUrl()}${normalized}`;
}

export function getToapisProxyUrl(): string | null {
  const raw = process.env.API_PROXY_URL;
  const proxyUrl = typeof raw === 'string' ? raw.trim() : '';
  return proxyUrl || null;
}

export function getToapisProxySummary(): string {
  const proxyUrl = getToapisProxyUrl();
  if (!proxyUrl) return 'direct';

  try {
    const parsed = new URL(proxyUrl);
    parsed.username = parsed.username ? '***' : '';
    parsed.password = parsed.password ? '***' : '';
    return parsed.toString();
  } catch {
    return 'invalid';
  }
}

function getProxyAgent(): SocksProxyAgent | null {
  const proxyUrl = getToapisProxyUrl();
  if (!proxyUrl) {
    cachedProxyUrl = null;
    cachedAgent = null;
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new Error('API_PROXY_URL is not a valid URL.');
  }

  if (parsed.protocol !== 'socks5h:') {
    throw new Error(
      'API_PROXY_URL must use socks5h:// so DNS resolution happens on the overseas proxy.',
    );
  }

  if (cachedProxyUrl !== proxyUrl) {
    cachedProxyUrl = proxyUrl;
    cachedAgent = new SocksProxyAgent(proxyUrl);
  }

  return cachedAgent;
}

export function getToapisOrigin(): string {
  return getToapisApiBaseUrl().replace(/\/v1\/?$/, '');
}

export async function toapisRequest<T = unknown>(
  config: Omit<AxiosRequestConfig, 'url' | 'method'> & {
    url: string;
    method: Method;
    timeout?: number;
  },
): Promise<AxiosResponse<T>> {
  const agent = getProxyAgent();

  return axios.request<T>({
    validateStatus: () => true,
    ...config,
    timeout: config.timeout ?? 45000,
    proxy: false,
    httpAgent: agent ?? undefined,
    httpsAgent: agent ?? undefined,
  });
}
