import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { assertPublicUrl, parseSseFrames, type ArkEvent } from './visual-agent.protocol';

export type ArkFile = { id: string; filename: string; mime_type: string; download_url?: string; status?: string };

export class ArkRequestError extends BadGatewayException {
  constructor(readonly upstreamStatus: number, readonly requestRejected: boolean, detail = '') {
    super(`方舟请求失败（${upstreamStatus}）${detail ? `：${detail}` : '。请检查上游错误详情。'}`);
  }
}

@Injectable()
export class VisualAgentClient {
  constructor(private readonly config: ConfigService) {}

  private get baseUrl() {
    return (this.config.get<string>('ARK_BASE_URL') || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
  }

  async request<T = any>(method: 'GET' | 'POST' | 'DELETE', path: string, data?: unknown): Promise<T> {
    const apiKey = this.config.get<string>('ARK_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('未配置 ARK_API_KEY');
    try {
      const response = await axios.request<T>({ method, url: `${this.baseUrl}${path}`, data,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 60000, maxRedirects: 0,
      });
      return response.data;
    } catch (error: any) {
      // Never serialize Axios errors: config contains the upstream API key.
      const status = Number(error?.response?.status) || 502;
      if (method === 'DELETE' && status === 404) return {} as T;
      // Only expose bounded identifiers, never raw response messages, prompts or Axios config.
      const identifier = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value) && !value.includes(apiKey) ? value : '';
      const code = identifier(error?.response?.data?.error?.code);
      const requestId = identifier(error?.response?.headers?.['x-request-id'] || error?.response?.data?.request_id);
      const resource = /^\/(agents|environments|sessions|files)(?:\/|\?|$)/.exec(path)?.[1] || 'unknown';
      const detail = [`${method} /${resource}`, code && `code=${code}`, requestId && `request_id=${requestId}`].filter(Boolean).join('；');
      throw new ArkRequestError(status, Boolean(error?.response) && status >= 400 && status < 500, detail);
    }
  }

  async history(sessionId: string, after?: string): Promise<ArkEvent[]> {
    const events: ArkEvent[] = [];
    let cursor = after;
    for (let page = 0; page < 100; page++) {
      const result = await this.request<{ data: ArkEvent[]; has_more?: boolean; last_id?: string }>('GET',
        `/sessions/${encodeURIComponent(sessionId)}/events?order=asc&limit=200${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`);
      const batch = result.data || [];
      events.push(...batch);
      if (!result.has_more) return events;
      const next = result.last_id || batch[batch.length - 1]?.id;
      if (!next || next === cursor) throw new BadGatewayException('方舟历史事件游标未推进');
      cursor = next;
    }
    throw new BadGatewayException('方舟历史事件超过分页上限');
  }

  async files(sessionId: string): Promise<ArkFile[]> {
    const files: ArkFile[] = [];
    let after = '';
    for (let page = 0; page < 100; page++) {
      const result = await this.request<{ data: ArkFile[]; has_more?: boolean; last_id?: string }>('GET',
        `/files?scope_id=${encodeURIComponent(sessionId)}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`);
      files.push(...(result.data || []));
      if (!result.has_more) return files;
      const next = result.last_id || result.data?.[result.data.length - 1]?.id;
      if (!next || next === after) throw new BadGatewayException('方舟文件游标未推进');
      after = next;
    }
    throw new BadGatewayException('方舟文件超过分页上限');
  }

  async openStream(sessionId: string, onEvent: (event: ArkEvent) => void) {
    const apiKey = this.config.get<string>('ARK_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('未配置 ARK_API_KEY');
    const abort = new AbortController();
    const connectTimer = setTimeout(() => abort.abort(), 20000);
    let source: Readable;
    try {
      const response = await axios.request<Readable>({ method: 'GET',
        url: `${this.baseUrl}/sessions/${encodeURIComponent(sessionId)}/events/stream`,
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'text/event-stream' },
        responseType: 'stream', signal: abort.signal, timeout: 0, maxRedirects: 0,
      });
      source = response.data;
    } catch {
      throw new BadGatewayException('无法连接方舟事件流');
    } finally { clearTimeout(connectTimer); }
    let resolveReady!: () => void;
    let rejectReady!: (reason: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const timer = setTimeout(() => { rejectReady(new Error('方舟事件流就绪超时')); abort.abort(); }, 20000);
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    let closed = false;
    const close = () => { closed = true; clearTimeout(timer); rejectReady(new Error('方舟事件流已关闭')); source.destroy(); abort.abort(); };
    const done = (async () => {
      try {
        for await (const chunk of source) {
          buffer += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          // Some Ark gateways send the ready comment followed by a single newline.
          if (/(^|\n): ready\r?\n/.test(buffer)) { clearTimeout(timer); resolveReady(); }
          const parsed = parseSseFrames(buffer);
          buffer = parsed.rest;
          if (buffer.length > 4 * 1024 * 1024) throw new Error('方舟事件帧过大');
          for (const frame of parsed.frames) {
            if (frame.ready) { clearTimeout(timer); resolveReady(); }
            if (!frame.data || frame.data === '[DONE]') continue;
            if (frame.data.length > 4 * 1024 * 1024) throw new Error('方舟事件帧过大');
            const event = JSON.parse(frame.data) as ArkEvent;
            if (typeof event.type === 'string') onEvent(event);
          }
        }
        if (!closed) throw new Error('方舟事件流断开');
      } catch (error) {
        rejectReady(new Error('方舟事件流断开或格式无效'));
        if (!closed) throw error;
      } finally { clearTimeout(timer); }
    })();
    // Consumers may attach after the first network chunk; mark rejection handled immediately.
    void ready.catch(() => undefined);
    void done.catch(() => undefined);
    return { ready, done, close };
  }

  async download(rawUrl: string): Promise<Readable> {
    const url = new URL(assertPublicUrl(rawUrl));
    const allowed = (this.config.get<string>('VISUAL_AGENT_DOWNLOAD_HOSTS') || 'volces.com,volcengine.com,volccdn.com')
      .split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
    if (url.protocol !== 'https:' || !allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw new BadGatewayException('产物下载地址不在允许的 HTTPS 存储域名内');
    }
    // No Ark Authorization on pre-signed file URLs; redirects must not bypass the allowlist.
    const response = await axios.request<Readable>({ method: 'GET', url: url.href, responseType: 'stream',
      timeout: 120000, maxRedirects: 0, headers: {},
    });
    return response.data;
  }
}
