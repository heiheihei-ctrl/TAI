import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type NewApiVideoTaskResponse = {
  id?: string;
  task_id?: string;
  status?: string;
  metadata?: Record<string, any>;
  result?: Record<string, any>;
  upstream_status?: string;
  error?: string;
};

type NewApiImageResponse = {
  created?: number;
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
};

type NewApiChatResponse = {
  id?: string;
  object?: string;
  choices?: Array<{
    index?: number;
    finish_reason?: string;
    message?: {
      role?: string;
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

@Injectable()
export class NewApiGatewayService {
  private readonly logger = new Logger(NewApiGatewayService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.getBaseUrl() && this.getApiKey());
  }

  shouldHandleImageModel(model?: string | null): boolean {
    return this.isModelEnabled(model, this.getModelAllowlist('NEW_API_IMAGE_MODELS'));
  }

  shouldHandleChatModel(model?: string | null): boolean {
    return this.isModelEnabled(model, this.getModelAllowlist('NEW_API_CHAT_MODELS'));
  }

  async submitVideoTask(input: {
    model: string;
    prompt?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    taskId: string;
    status: 'queued' | 'processing' | 'succeeded' | 'failed';
    raw: Record<string, unknown>;
  }> {
    const payload = {
      model: input.model,
      prompt: input.prompt,
      metadata: input.metadata ?? {},
    };

    const response = await this.request<NewApiVideoTaskResponse>('/v1/videos', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const taskId = this.normalizeTaskId(response.task_id || response.id);
    if (!taskId) {
      throw new BadGatewayException('new-api submit succeeded but task_id is missing');
    }

    return {
      taskId,
      status: this.normalizeStatus(response.status),
      raw: response as Record<string, unknown>,
    };
  }

  async queryVideoTask(taskId: string): Promise<{
    status: 'queued' | 'processing' | 'succeeded' | 'failed';
    videoUrl?: string;
    thumbnailUrl?: string;
    upstreamStatus?: string;
    error?: string;
    raw: Record<string, unknown>;
  }> {
    const normalizedTaskId = this.unwrapTaskId(taskId);
    if (!normalizedTaskId) {
      throw new BadGatewayException('new-api task id is invalid');
    }

    const response = await this.request<NewApiVideoTaskResponse>(
      `/v1/videos/${encodeURIComponent(normalizedTaskId)}`,
      { method: 'GET' },
    );

    const result = response.result && typeof response.result === 'object' ? response.result : {};
    const metadata =
      response.metadata && typeof response.metadata === 'object' ? response.metadata : {};
    const videoUrl = this.pickFirstString(result, ['url', 'videoUrl']) || this.pickFirstString(metadata, ['url', 'videoUrl']);
    const thumbnailUrl =
      this.pickFirstString(result, ['thumbnailUrl', 'thumbnail_url']) ||
      this.pickFirstString(metadata, ['thumbnailUrl', 'thumbnail_url']);

    return {
      status: this.normalizeStatus(response.status),
      videoUrl,
      thumbnailUrl,
      upstreamStatus: response.upstream_status,
      error: response.error,
      raw: response as Record<string, unknown>,
    };
  }

  async generateImage(input: {
    model: string;
    prompt: string;
    size?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    imageUrl?: string;
    imageBase64?: string;
    raw: Record<string, unknown>;
  }> {
    const response = await this.request<NewApiImageResponse>('/v1/images/generations', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        size: input.size,
        metadata: input.metadata ?? {},
      }),
    });

    const first = Array.isArray(response.data) ? response.data[0] : undefined;
    return {
      imageUrl: typeof first?.url === 'string' ? first.url : undefined,
      imageBase64: typeof first?.b64_json === 'string' ? first.b64_json : undefined,
      raw: response as Record<string, unknown>,
    };
  }

  async editImage(input: {
    model: string;
    prompt: string;
    imageUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    imageUrl?: string;
    imageBase64?: string;
    raw: Record<string, unknown>;
  }> {
    const response = await this.request<NewApiImageResponse>('/v1/images/edits', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        imageUrl: input.imageUrl,
        metadata: input.metadata ?? {},
      }),
    });

    const first = Array.isArray(response.data) ? response.data[0] : undefined;
    return {
      imageUrl: typeof first?.url === 'string' ? first.url : undefined,
      imageBase64: typeof first?.b64_json === 'string' ? first.b64_json : undefined,
      raw: response as Record<string, unknown>,
    };
  }

  async chatCompletions(input: {
    model: string;
    prompt: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    text: string;
    raw: Record<string, unknown>;
  }> {
    const response = await this.request<NewApiChatResponse>('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: 'user',
            content: input.prompt,
          },
        ],
        metadata: input.metadata ?? {},
      }),
    });

    const text =
      response.choices?.find((choice) => typeof choice?.message?.content === 'string')?.message
        ?.content || '';

    return {
      text,
      raw: response as Record<string, unknown>,
    };
  }

  wrapTaskId(taskId: string): string {
    return `new-api:${taskId}`;
  }

  isWrappedTaskId(taskId: string): boolean {
    return typeof taskId === 'string' && taskId.startsWith('new-api:');
  }

  unwrapTaskId(taskId: string): string {
    const normalized = typeof taskId === 'string' ? taskId.trim() : '';
    return normalized.startsWith('new-api:') ? normalized.slice('new-api:'.length) : normalized;
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('NEW_API_BASE_URL')?.trim().replace(/\/$/, '') || '';
  }

  private getApiKey(): string {
    return this.configService.get<string>('NEW_API_KEY')?.trim() || '';
  }

  private getModelAllowlist(envKey: string): Set<string> {
    const raw = this.configService.get<string>(envKey) || '';
    return new Set(
      raw
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const apiKey = this.getApiKey();
    if (!baseUrl || !apiKey) {
      throw new ServiceUnavailableException(
        'new-api is not configured. Please set NEW_API_BASE_URL and NEW_API_KEY.',
      );
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(`new-api request failed: ${message}`);
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        payload.error &&
        typeof payload.error === 'object' &&
        'message' in payload.error
          ? String((payload.error as Record<string, unknown>).message)
          : `new-api responded with HTTP ${response.status}`;
      throw new BadGatewayException(errorMessage);
    }

    return payload as T;
  }

  private normalizeTaskId(value?: string): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private isModelEnabled(model: string | null | undefined, allowlist: Set<string>): boolean {
    if (!this.isConfigured()) {
      return false;
    }

    const normalized = typeof model === 'string' ? model.trim().toLowerCase() : '';
    return Boolean(normalized) && allowlist.has(normalized);
  }

  private normalizeStatus(value?: string): 'queued' | 'processing' | 'succeeded' | 'failed' {
    const normalized = String(value || '').trim().toLowerCase();
    if (['queued', 'pending', 'submitted', 'created'].includes(normalized)) return 'queued';
    if (['processing', 'running', 'in_progress'].includes(normalized)) return 'processing';
    if (['succeeded', 'success', 'completed', 'done'].includes(normalized)) return 'succeeded';
    if (['failed', 'error', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
    return 'processing';
  }

  private pickFirstString(source: Record<string, any>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }
}
