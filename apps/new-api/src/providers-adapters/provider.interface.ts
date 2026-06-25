import { TaskType } from '@prisma/client';

export interface RouteResolution {
  modelKey: string;
  providerKey: string;
  channelKey: string;
  taskType: TaskType;
  protocolType: 'task' | 'sync' | 'stream';
  routeKey: string;
  channelConfig: {
    baseUrl?: string | null;
    timeoutMs?: number | null;
    credentialsJson?: unknown;
  };
  mappingConfig?: unknown;
}

export interface SubmitVideoTaskInput {
  prompt?: string;
  metadata?: Record<string, unknown>;
}

export interface VideoTaskSubmission {
  upstreamTaskId: string;
  upstreamStatus?: string;
  response?: unknown;
}

export interface VideoTaskQueryResult {
  upstreamTaskId?: string;
  upstreamStatus?: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  result?: Record<string, unknown>;
  errorMessage?: string;
  response?: unknown;
}

export interface ImageGenerationInput {
  prompt: string;
  size?: string;
  metadata?: Record<string, unknown>;
}

export interface ImageEditInput {
  prompt: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatCompletionInput {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface ProviderAdapter {
  readonly providerKey: string;
  submitVideoTask(route: RouteResolution, input: SubmitVideoTaskInput): Promise<VideoTaskSubmission>;
  queryVideoTask(route: RouteResolution, upstreamTaskId: string): Promise<VideoTaskQueryResult>;
  generateImage(route: RouteResolution, input: ImageGenerationInput): Promise<unknown>;
  editImage(route: RouteResolution, input: ImageEditInput): Promise<unknown>;
  chatCompletions(route: RouteResolution, input: ChatCompletionInput): Promise<unknown>;
}
