import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apimartRequest, getApimartProxySummary } from '../../utils/apimartHttpClient';

interface Nano2GenerateRequest {
  prompt: string;
  model?: string;
  size?: string;
  resolution?: string;
  n?: number;
  image_urls?: string[];
  google_search?: boolean;
  google_image_search?: boolean;
  official_fallback?: boolean;
  quality?: 'auto' | 'low' | 'medium' | 'high';
  background?: 'auto' | 'opaque' | 'transparent';
  moderation?: 'auto' | 'low';
  output_format?: 'png' | 'jpeg' | 'webp';
  output_compression?: number;
  mask_url?: string;
}

interface Nano2TaskResponse {
  code: number;
  data: Array<{
    status: string;
    task_id: string;
  }>;
}

@Injectable()
export class Nano2Service {
  private readonly logger = new Logger(Nano2Service.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.apimart.ai/v1/images/generations';
  private readonly maxSubmitAttempts = 2;
  private readonly submitRetryDelayMs = 1200;
  private readonly timeoutMs: number;
  private readonly queryMaxRetries = 3;
  private readonly queryRetryDelayMs = [300, 800];

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('NANO2_API_KEY') || '';
    if (!this.apiKey) {
      this.logger.warn('NANO2_API_KEY not configured');
    }
    this.timeoutMs = this.parsePositiveInt(this.config.get<string>('NANO2_API_TIMEOUT_MS'), 30_000);
    this.logger.log(`Nano2Service initialized (apimartProxy=${getApimartProxySummary()})`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return Math.floor(num);
    }
    return fallback;
  }

  private mapApimartNetworkError(error: unknown, context: string): Error {
    const err =
      error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
    const causeCode =
      typeof (err as any)?.cause?.code === 'string'
        ? String((err as any).cause.code)
        : typeof (err as any)?.code === 'string'
        ? String((err as any).code)
        : '';
    const message = String(err.message || '');

    if (causeCode === 'ENOTFOUND') {
      return new ServiceUnavailableException(
        `APIMart 域名解析失败（api.apimart.ai），请检查服务器 DNS 或代理网络。${context}`,
      ) as unknown as Error;
    }
    if (causeCode === 'ETIMEDOUT' || err.name === 'AbortError') {
      return new ServiceUnavailableException(
        `APIMart 网络连接超时，请检查服务器到 api.apimart.ai 的网络链路或代理配置。${context}`,
      ) as unknown as Error;
    }
    if (
      causeCode === 'ECONNRESET' ||
      causeCode === 'ECONNREFUSED' ||
      causeCode === 'EAI_AGAIN' ||
      message.toLowerCase().includes('fetch failed')
    ) {
      return new ServiceUnavailableException(
        `APIMart 网络请求失败，请检查服务器外网出口、代理或防火墙配置。${context} ${message}`.trim(),
      ) as unknown as Error;
    }
    return err;
  }

  private isRetryableApimartQueryError(error: unknown): boolean {
    const err = error instanceof Error ? error : new Error(String(error));
    const code =
      typeof (err as any)?.cause?.code === 'string'
        ? String((err as any).cause.code)
        : typeof (err as any)?.code === 'string'
          ? String((err as any).code)
          : '';
    const message = String(err.message || '').toLowerCase();

    return (
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNABORTED' ||
      code === 'EAI_AGAIN' ||
      message.includes('econnreset') ||
      message.includes('timeout') ||
      message.includes('socket hang up') ||
      message.includes('fetch failed')
    );
  }

  private extractErrorDetailsFromAxios(response: { status: number; data: unknown; headers?: Record<string, unknown> }): {
    message: string;
    rawBody: string;
    requestId?: string;
  } {
    const headers = response.headers ?? {};
    const getHeader = (key: string): string | undefined => {
      const value = headers[key] ?? headers[key.toLowerCase()];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const requestId =
      getHeader('x-request-id') ||
      getHeader('request-id') ||
      getHeader('x-trace-id') ||
      getHeader('trace-id');

    const rawBody =
      typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '');
    let parsed: Record<string, any> | null = null;
    if (rawBody && typeof rawBody === 'string') {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        parsed = null;
      }
    }

    const candidateMessage =
      parsed?.error?.message ||
      parsed?.message ||
      rawBody ||
      `HTTP ${response.status}`;

    const message =
      typeof candidateMessage === 'string'
        ? candidateMessage
        : JSON.stringify(candidateMessage);

    return {
      message,
      rawBody,
      requestId,
    };
  }

  async generateImage(request: Nano2GenerateRequest): Promise<{ taskId: string; status: string }> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Nano2 API key not configured');
    }

    const payload: Record<string, any> = {
      model: request.model?.trim() || 'gemini-3.1-flash-image-preview',
      prompt: request.prompt,
      size: request.size || '1:1',
      n: request.n || 1,
      ...(request.image_urls && { image_urls: request.image_urls }),
    };
    if (typeof request.resolution === 'string' && request.resolution.trim()) {
      payload.resolution = request.resolution.trim();
    }
    if (typeof request.google_search === 'boolean') {
      payload.google_search = request.google_search;
    }
    if (typeof request.google_image_search === 'boolean') {
      payload.google_image_search = request.google_image_search;
    }
    if (typeof request.official_fallback === 'boolean') {
      payload.official_fallback = request.official_fallback;
    }
    if (typeof request.quality === 'string' && request.quality.trim()) {
      payload.quality = request.quality.trim();
    }
    if (typeof request.background === 'string' && request.background.trim()) {
      payload.background = request.background.trim();
    }
    if (typeof request.moderation === 'string' && request.moderation.trim()) {
      payload.moderation = request.moderation.trim();
    }
    if (typeof request.output_format === 'string' && request.output_format.trim()) {
      payload.output_format = request.output_format.trim();
    }
    if (typeof request.output_compression === 'number' && Number.isFinite(request.output_compression)) {
      payload.output_compression = Math.max(0, Math.min(100, Math.trunc(request.output_compression)));
    }
    if (typeof request.mask_url === 'string' && request.mask_url.trim()) {
      payload.mask_url = request.mask_url.trim();
    }

    this.logger.log(
      `Nano2 request: ${JSON.stringify({
        ...payload,
        prompt: payload.prompt.substring(0, 50),
      })}`,
    );

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.maxSubmitAttempts; attempt += 1) {
      try {
        const response = await apimartRequest<Nano2TaskResponse>({
          url: this.baseUrl,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          data: payload,
          timeout: this.timeoutMs,
        });

        if (response.status < 200 || response.status >= 300) {
          const details = this.extractErrorDetailsFromAxios(response);
          const errorMessage = `HTTP ${response.status}${
            details.requestId ? ` [requestId=${details.requestId}]` : ''
          } - ${details.message}`;

          const shouldRetry = response.status >= 500 && attempt < this.maxSubmitAttempts;
          if (shouldRetry) {
            this.logger.warn(
              `Nano2 submit attempt ${attempt}/${this.maxSubmitAttempts} failed with upstream ${response.status}, retrying in ${this.submitRetryDelayMs}ms. ${errorMessage}`,
            );
            await this.sleep(this.submitRetryDelayMs);
            continue;
          }

          this.logger.error(
            `Nano2 submit failed: ${errorMessage}. rawBody=${details.rawBody?.slice(0, 1500) || '(empty)'}`,
          );
          throw new Error(errorMessage);
        }

        const data: Nano2TaskResponse =
          typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        if (!Array.isArray(data?.data) || data.data.length === 0 || !data.data[0]?.task_id) {
          throw new Error(`Nano2 submit succeeded but task_id missing. payload=${JSON.stringify(data)}`);
        }
        return {
          taskId: data.data[0].task_id,
          status: data.data[0].status,
        };
      } catch (error: any) {
        lastError =
          error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');

        // 识别 AbortError（请求超时），转换为可重试的超时错误
        if (lastError.name === 'AbortError') {
          lastError = new Error(`Nano2 submit request timeout after ${this.timeoutMs}ms`);
        }

        const isHttpError = /^HTTP\s\d{3}/.test(lastError.message);
        const shouldRetryNetworkLike = !isHttpError && attempt < this.maxSubmitAttempts;
        if (shouldRetryNetworkLike) {
          this.logger.warn(
            `Nano2 submit attempt ${attempt}/${this.maxSubmitAttempts} failed with network/unknown error (${lastError.message}), retrying in ${this.submitRetryDelayMs}ms`,
          );
          await this.sleep(this.submitRetryDelayMs);
          continue;
        }
        throw this.mapApimartNetworkError(lastError, 'Nano2 提交任务失败');
      }
    }

    throw lastError ?? new Error('Nano2 submit failed: unknown error');
  }

  async queryTask(taskId: string): Promise<{ status: string; imageUrl?: string }> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Nano2 API key not configured');
    }

    const queryUrl = `https://api.apimart.ai/v1/tasks/${taskId}`;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= this.queryMaxRetries; attempt += 1) {
      try {
        const response = await apimartRequest<any>({
          url: queryUrl,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
          timeout: this.timeoutMs,
        });

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Failed to query task: HTTP ${response.status}`);
        }

        const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        this.logger.log(`Nano2 task query raw response: ${JSON.stringify(json)}`);

        const data = json.data || json;

        let imageUrl: string | undefined;
        if (data.result?.images?.[0]?.url) {
          const urlField = data.result.images[0].url;
          imageUrl = Array.isArray(urlField) ? urlField[0] : urlField;
        } else {
          imageUrl = data.image_url || data.imageUrl;
        }

        this.logger.log(`Nano2 parsed - status: ${data.status}, imageUrl: ${imageUrl || 'not found'}`);

        return {
          status: data.status || 'processing',
          imageUrl,
        };
      } catch (error: any) {
        lastError = error;
        if (attempt < this.queryMaxRetries && this.isRetryableApimartQueryError(error)) {
          const delayMs =
            this.queryRetryDelayMs[attempt - 1] ??
            this.queryRetryDelayMs[this.queryRetryDelayMs.length - 1] ??
            800;
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Nano2 task query retry ${attempt}/${this.queryMaxRetries} in ${delayMs}ms: task=${taskId}, error=${message}`,
          );
          await this.sleep(delayMs);
          continue;
        }
        throw this.mapApimartNetworkError(error, 'Nano2 查询任务失败');
      }
    }

    throw this.mapApimartNetworkError(lastError, 'Nano2 查询任务失败');
  }
}
