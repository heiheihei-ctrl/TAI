import axios, { AxiosRequestConfig, AxiosResponse, Method } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

let cachedProxyUrl: string | null | undefined;
let cachedAgent: SocksProxyAgent | null = null;

export function getApimartProxyUrl(): string | null {
  const raw = process.env.API_PROXY_URL;
  const proxyUrl = typeof raw === 'string' ? raw.trim() : '';
  return proxyUrl || null;
}

export function getApimartProxySummary(): string {
  const proxyUrl = getApimartProxyUrl();
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
  const proxyUrl = getApimartProxyUrl();
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

export async function apimartRequest<T = unknown>(
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
