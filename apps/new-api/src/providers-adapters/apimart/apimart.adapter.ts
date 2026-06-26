import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import {
  ChatCompletionInput,
  ImageEditInput,
  ImageGenerationInput,
  ProviderAdapter,
  RouteResolution,
  SubmitVideoTaskInput,
  VideoTaskQueryResult,
  VideoTaskSubmission,
} from '../provider.interface';
import {
  buildOmniFlashExtApimartPayload,
  isOmniFlashExtModelKey,
  parseOmniFlashExtTaskResponse,
} from './omni-flash-ext.util';
import {
  apimartRequest,
  getApimartProxySummary,
} from '../../common/utils/apimart-http-client';

@Injectable()
export class ApimartAdapter implements ProviderAdapter {
  readonly providerKey = 'apimart';
  private readonly logger = new Logger(ApimartAdapter.name);

  async submitVideoTask(route: RouteResolution, input: SubmitVideoTaskInput): Promise<VideoTaskSubmission> {
    this.assertSupportedVideoModel(route);
    const channel = this.resolveChannel(route);
    const payload = buildOmniFlashExtApimartPayload({
      prompt: input.prompt,
      metadata: input.metadata,
    });

    const response = await this.fetchJson(channel, '/v1/videos/generations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const taskId = this.pickTaskId(response.payload);
    if (!taskId) {
      throw new AppException(
        'PROVIDER_UPSTREAM_ERROR',
        'APIMart did not return a task id for Omni Flash Ext',
        502,
      );
    }

    return {
      upstreamTaskId: taskId,
      upstreamStatus: this.pickStatus(response.payload) || 'queued',
      response: response.payload,
    };
  }

  async queryVideoTask(route: RouteResolution, upstreamTaskId: string): Promise<VideoTaskQueryResult> {
    this.assertSupportedVideoModel(route);
    const channel = this.resolveChannel(route);
    const taskId = upstreamTaskId.trim();
    if (!taskId) {
      throw new AppException('INVALID_TASK_ID', 'APIMart upstream task id is empty', 400);
    }

    const endpoints = [
      `/v1/tasks/${encodeURIComponent(taskId)}?language=zh&t=${Date.now()}`,
      `/v1/videos/${encodeURIComponent(taskId)}?t=${Date.now()}`,
    ];

    let lastError: string | null = null;
    for (const endpoint of endpoints) {
      const response = await this.fetchJson(channel, endpoint, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      }, { allowNotFound: true });

      if (response.status === 404) {
        continue;
      }
      if (response.status >= 400) {
        lastError = `APIMart query failed with HTTP ${response.status}`;
        break;
      }

      const parsed = parseOmniFlashExtTaskResponse(response.payload, taskId);
      return {
        upstreamTaskId: taskId,
        upstreamStatus: parsed.rawStatus || parsed.status,
        status: parsed.status,
        result: parsed.videoUrl
          ? {
              url: parsed.videoUrl,
              ...(parsed.thumbnailUrl ? { thumbnailUrl: parsed.thumbnailUrl } : {}),
            }
          : parsed.thumbnailUrl
            ? { thumbnailUrl: parsed.thumbnailUrl }
            : undefined,
        response: response.payload,
      };
    }

    return {
      upstreamTaskId: taskId,
      upstreamStatus: 'processing',
      status: 'processing',
      errorMessage: lastError ?? undefined,
    };
  }

  async generateImage(_route: RouteResolution, _input: ImageGenerationInput): Promise<unknown> {
    throw new AppException('PROVIDER_NOT_IMPLEMENTED', 'APIMart adapter is not implemented yet', 501);
  }

  async editImage(_route: RouteResolution, _input: ImageEditInput): Promise<unknown> {
    throw new AppException('PROVIDER_NOT_IMPLEMENTED', 'APIMart adapter is not implemented yet', 501);
  }

  async chatCompletions(route: RouteResolution, input: ChatCompletionInput): Promise<unknown> {
    const channel = this.resolveChannel(route);
    const payload = {
      model: route.modelKey,
      stream: false,
      messages: input.messages,
    };

    const response = await this.fetchJson(channel, '/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return response.payload;
  }

  private assertSupportedVideoModel(route: RouteResolution) {
    if (!isOmniFlashExtModelKey(route.modelKey)) {
      throw new AppException(
        'PROVIDER_NOT_IMPLEMENTED',
        `APIMart adapter currently supports only ${'omni-flash-ext'}`,
        501,
      );
    }
  }

  private resolveChannel(route: RouteResolution): { apiKey: string; baseUrl: string; timeoutMs: number } {
    const credentials =
      route.channelConfig.credentialsJson &&
      typeof route.channelConfig.credentialsJson === 'object' &&
      !Array.isArray(route.channelConfig.credentialsJson)
        ? (route.channelConfig.credentialsJson as Record<string, unknown>)
        : {};

    const apiKey =
      this.pickString(credentials.apiKey) ||
      this.pickString(credentials.api_key) ||
      this.pickString(credentials.token) ||
      this.pickString(credentials.bearerToken);
    if (!apiKey) {
      throw new AppException(
        'PROVIDER_CREDENTIALS_INVALID',
        `Channel ${route.channelKey} does not contain an APIMart apiKey`,
        500,
      );
    }

    return {
      apiKey,
      baseUrl: (route.channelConfig.baseUrl || this.pickString(credentials.baseUrl) || 'https://api.apimart.ai')
        .trim()
        .replace(/\/$/, ''),
      timeoutMs: route.channelConfig.timeoutMs ?? 30000,
    };
  }

  private async fetchJson(
    channel: { apiKey: string; baseUrl: string; timeoutMs: number },
    path: string,
    init: RequestInit,
    options?: { allowNotFound?: boolean },
  ): Promise<{ status: number; payload: unknown }> {
    try {
      const response = await apimartRequest({
        url: `${channel.baseUrl}${path}`,
        method: (init.method || 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        headers: {
          Authorization: `Bearer ${channel.apiKey}`,
          'Content-Type': 'application/json',
          ...this.normalizeHeaders(init.headers),
        },
        data: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
        timeout: channel.timeoutMs,
      });

      const payload: unknown =
        typeof response.data === 'string'
          ? this.parseJsonText(response.data)
          : (response.data ?? {});

      if ((response.status < 200 || response.status >= 300) && !(options?.allowNotFound && response.status === 404)) {
        const message = this.extractUpstreamError(payload) || `APIMart responded with HTTP ${response.status}`;
        this.logger.warn(
          `APIMart request failed: path=${path}, status=${response.status}, proxy=${getApimartProxySummary()}, message=${message}`,
        );
        throw new AppException('PROVIDER_UPSTREAM_ERROR', message, 502, {
          provider: this.providerKey,
          status: response.status,
          path,
        });
      }

      return { status: response.status, payload };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      const code =
        error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : '';
      const message =
        code === 'ECONNABORTED'
          ? 'APIMart request timed out'
          : error instanceof Error
            ? error.message
            : String(error);
      this.logger.warn(`APIMart network error: path=${path}, proxy=${getApimartProxySummary()}, message=${message}`);
      throw new AppException('PROVIDER_NETWORK_ERROR', message, 502, {
        provider: this.providerKey,
        path,
      });
    }
  }

  private parseJsonText(text: string): unknown {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  private normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
    if (!headers) return {};
    if (headers instanceof Headers) {
      return Object.fromEntries(headers.entries());
    }
    if (Array.isArray(headers)) {
      return Object.fromEntries(headers);
    }
    return headers;
  }

  private pickTaskId(payload: unknown): string | undefined {
    const record =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    return (
      this.pickString(record.id) ||
      this.pickString(record.task_id) ||
      this.pickString(record.taskId) ||
      this.pickString(this.readNested(record, ['data', 'id'])) ||
      this.pickString(this.readNested(record, ['data', 'task_id'])) ||
      this.pickString(this.readNested(record, ['data', 'taskId'])) ||
      this.pickString(this.readNested(record, ['data', 0, 'id'])) ||
      this.pickString(this.readNested(record, ['data', 0, 'task_id'])) ||
      this.pickString(this.readNested(record, ['data', 0, 'taskId']))
    );
  }

  private pickStatus(payload: unknown): string | undefined {
    const record =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    return (
      this.pickString(record.status) ||
      this.pickString(record.state) ||
      this.pickString(record.task_status) ||
      this.pickString(this.readNested(record, ['data', 'status'])) ||
      this.pickString(this.readNested(record, ['data', 0, 'status']))
    );
  }

  private extractUpstreamError(payload: unknown): string | null {
    const record =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    return (
      this.pickString(this.readNested(record, ['error', 'message'])) ||
      this.pickString(record.message) ||
      this.pickString(record.error_description) ||
      null
    );
  }

  private pickString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private readNested(value: unknown, path: Array<string | number>): unknown {
    let current: unknown = value;
    for (const segment of path) {
      if (Array.isArray(current) && typeof segment === 'number') {
        current = current[segment];
        continue;
      }
      if (current && typeof current === 'object' && !Array.isArray(current) && typeof segment === 'string') {
        current = (current as Record<string, unknown>)[segment];
        continue;
      }
      return undefined;
    }
    return current;
  }
}
