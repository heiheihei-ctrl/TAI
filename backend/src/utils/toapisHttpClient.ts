import axios, { AxiosRequestConfig, AxiosResponse, Method } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

/** 主域名：默认优先使用 */
const PRIMARY_TOAPIS_BASE = 'https://toapis.com/v1';
/** 备用域名：仅在主域名网络不可达时回退 */
const FALLBACK_TOAPIS_BASE = 'https://toapis.xyz/v1';

let cachedProxyUrl: string | null | undefined;
let cachedAgent: SocksProxyAgent | null = null;

function normalizeApiBase(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '');
}

function isToapisXyzBase(base: string): boolean {
  try {
    const host = new URL(base).hostname.toLowerCase();
    return host === 'toapis.xyz' || host === 'www.toapis.xyz';
  } catch {
    return /toapis\.xyz/i.test(base);
  }
}

function isToapisComBase(base: string): boolean {
  try {
    const host = new URL(base).hostname.toLowerCase();
    return host === 'toapis.com' || host === 'www.toapis.com';
  } catch {
    return /toapis\.com/i.test(base);
  }
}

/**
 * 主 API Base（始终优先 toapis.com）。
 * 若环境变量误配成 toapis.xyz，仍回落到主域名，避免直接打备用域。
 */
export function getToapisApiBaseUrl(): string {
  const raw = normalizeApiBase(
    process.env.TOAPIS_API_BASE_URL ||
      process.env.TOAPIS_API_ENDPOINT ||
      PRIMARY_TOAPIS_BASE,
  );
  if (!raw || isToapisXyzBase(raw)) {
    return PRIMARY_TOAPIS_BASE;
  }
  return raw;
}

/** 备用 API Base（toapis.xyz） */
export function getToapisFallbackApiBaseUrl(): string {
  const raw = normalizeApiBase(
    process.env.TOAPIS_API_FALLBACK_BASE_URL || FALLBACK_TOAPIS_BASE,
  );
  return raw || FALLBACK_TOAPIS_BASE;
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

/**
 * 规范化 ToAPIs 返回的结果图外链。
 * - 文件 CDN 固定为 files.toapis.com，禁止改写成 API 域名 toapis.xyz
 * - 若上游给出 API 域上的 /__files/ 别名，还原为 files.toapis.com
 * - API 域名切换只影响 /v1 接口，不影响结果图 CDN
 */
export function rewriteToapisLegacyUrl(rawUrl: string): string {
  const input = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!input) return input;
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname || '/';

    // 已经是文件 CDN：原样返回
    if (host === 'files.toapis.com') {
      return input;
    }

    // API 域上的 /__files/... 是文件 CDN 别名，还原到 files.toapis.com
    if (
      (host === 'toapis.com' ||
        host === 'toapis.xyz' ||
        host === 'www.toapis.com' ||
        host === 'www.toapis.xyz') &&
      pathname.startsWith('/__files/')
    ) {
      parsed.hostname = 'files.toapis.com';
      parsed.pathname = pathname.slice('/__files'.length) || '/';
      return parsed.toString();
    }

    // 其它 *.toapis.com / *.toapis.xyz 结果图链接保持原样，避免误伤 CDN
    return input;
  } catch {
    return input;
  }
}

function extractErrorCode(error: unknown): string {
  const err = error as any;
  if (typeof err?.code === 'string') return err.code;
  if (typeof err?.cause?.code === 'string') return err.cause.code;
  if (typeof err?.cause?.cause?.code === 'string') return err.cause.cause.code;
  return '';
}

/** 主域名网络层失败时才切备用（DNS / 连接 / 超时） */
export function isToapisNetworkFailoverError(error: unknown): boolean {
  const code = extractErrorCode(error).toUpperCase();
  const message = String((error as any)?.message || '').toLowerCase();
  return (
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_SOCKET' ||
    message.includes('enotfound') ||
    message.includes('getaddrinfo') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    message.includes('network error') ||
    message.includes('fetch failed')
  );
}

/** 把请求 URL 从主域名改写到备用域名（仅 toapis.com → toapis.xyz） */
export function rewriteToapisUrlToFallback(url: string): string | null {
  const input = typeof url === 'string' ? url.trim() : '';
  if (!input) return null;
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'toapis.com' && host !== 'www.toapis.com') {
      return null;
    }
    const fallbackBase = getToapisFallbackApiBaseUrl();
    const fallbackHost = new URL(
      fallbackBase.startsWith('http') ? fallbackBase : `https://${fallbackBase}`,
    ).hostname;
    parsed.hostname = fallbackHost;
    return parsed.toString();
  } catch {
    // 相对或残缺 URL：按 base 前缀替换
    const primary = getToapisApiBaseUrl();
    const fallback = getToapisFallbackApiBaseUrl();
    if (input.startsWith(primary)) {
      return `${fallback}${input.slice(primary.length)}`;
    }
    return null;
  }
}

async function axiosToapisOnce<T>(
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

/**
 * ToAPIs 请求：默认走 toapis.com；仅网络不可达时自动切换 toapis.xyz 重试一次。
 */
export async function toapisRequest<T = unknown>(
  config: Omit<AxiosRequestConfig, 'url' | 'method'> & {
    url: string;
    method: Method;
    timeout?: number;
  },
): Promise<AxiosResponse<T>> {
  try {
    return await axiosToapisOnce<T>(config);
  } catch (error) {
    if (!isToapisNetworkFailoverError(error)) {
      throw error;
    }

    const fallbackUrl = rewriteToapisUrlToFallback(config.url);
    if (!fallbackUrl || fallbackUrl === config.url) {
      throw error;
    }

    // eslint-disable-next-line no-console
    console.warn(
      `[ToAPIs] primary host failed (${extractErrorCode(error) || 'network'}), fallback → ${fallbackUrl}`,
    );

    try {
      return await axiosToapisOnce<T>({ ...config, url: fallbackUrl });
    } catch (fallbackError) {
      const primaryHint = getToapisApiBaseUrl();
      const fallbackHint = getToapisFallbackApiBaseUrl();
      const code = extractErrorCode(fallbackError) || extractErrorCode(error);
      const err = new Error(
        `ToAPIs 主备域名均不可达（primary=${primaryHint}, fallback=${fallbackHint}, code=${code || 'unknown'}）`,
      );
      (err as any).cause = fallbackError;
      throw err;
    }
  }
}
