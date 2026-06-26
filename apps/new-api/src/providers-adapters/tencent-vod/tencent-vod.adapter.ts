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
  buildKling30TencentCreatePayload,
  buildTencentVodAuthorization,
  extractTencentVodFileId,
  extractTencentVodStatus,
  extractTencentVodVideoUrl,
  normalizeTencentVodStatus,
  TencentVodChannelConfig,
} from './tencent-vod.util';

@Injectable()
export class TencentVodAdapter implements ProviderAdapter {
  readonly providerKey = 'tencent_vod';
  private readonly logger = new Logger(TencentVodAdapter.name);

  async submitVideoTask(route: RouteResolution, input: SubmitVideoTaskInput): Promise<VideoTaskSubmission> {
    this.assertSupportedModel(route);
    const channel = this.resolveChannel(route);
    const metadata = {
      prompt: input.prompt,
      ...(input.metadata || {}),
      subAppId: channel.subAppId,
    };
    const payloadObject = buildKling30TencentCreatePayload(metadata);
    const response = await this.callTencentApi(channel, 'CreateAigcVideoTask', payloadObject);
    const taskId = this.pickIdentifier(response.TaskId ?? response.taskId);
    if (!taskId) {
      throw new AppException(
        'PROVIDER_UPSTREAM_ERROR',
        'Tencent VOD returned no TaskId for CreateAigcVideoTask',
        502,
      );
    }

    return {
      upstreamTaskId: taskId,
      upstreamStatus: extractTencentVodStatus(response) || 'queued',
      response,
    };
  }

  async queryVideoTask(route: RouteResolution, upstreamTaskId: string): Promise<VideoTaskQueryResult> {
    this.assertSupportedModel(route);
    const channel = this.resolveChannel(route);
    const taskId = upstreamTaskId.trim();
    if (!taskId) {
      throw new AppException('INVALID_TASK_ID', 'Tencent VOD upstream task id is empty', 400);
    }

    const response = await this.callTencentApi(channel, 'DescribeTaskDetail', {
      TaskId: taskId,
      SubAppId: channel.subAppId,
    });
    const upstreamStatus = extractTencentVodStatus(response) || 'processing';
    const status = normalizeTencentVodStatus(upstreamStatus);
    const videoUrl = extractTencentVodVideoUrl(response);
    const fileId = extractTencentVodFileId(response);

    return {
      upstreamTaskId: taskId,
      upstreamStatus,
      status,
      result:
        videoUrl || fileId
          ? {
              ...(videoUrl ? { url: videoUrl } : {}),
              ...(fileId ? { fileId } : {}),
            }
          : undefined,
      response,
      errorMessage: status === 'failed' ? this.extractTencentError(response) || 'Tencent VOD task failed' : undefined,
    };
  }

  async generateImage(_route: RouteResolution, _input: ImageGenerationInput): Promise<unknown> {
    throw new AppException('PROVIDER_NOT_IMPLEMENTED', 'Tencent VOD adapter does not implement image generation', 501);
  }

  async editImage(_route: RouteResolution, _input: ImageEditInput): Promise<unknown> {
    throw new AppException('PROVIDER_NOT_IMPLEMENTED', 'Tencent VOD adapter does not implement image editing', 501);
  }

  async chatCompletions(_route: RouteResolution, _input: ChatCompletionInput): Promise<unknown> {
    throw new AppException('PROVIDER_NOT_IMPLEMENTED', 'Tencent VOD adapter does not implement chat completions', 501);
  }

  private assertSupportedModel(route: RouteResolution) {
    if (route.modelKey !== 'kling-3.0') {
      throw new AppException(
        'PROVIDER_NOT_IMPLEMENTED',
        'Tencent VOD adapter currently supports only kling-3.0',
        501,
      );
    }
  }

  private resolveChannel(route: RouteResolution): TencentVodChannelConfig {
    const credentials =
      route.channelConfig.credentialsJson &&
      typeof route.channelConfig.credentialsJson === 'object' &&
      !Array.isArray(route.channelConfig.credentialsJson)
        ? (route.channelConfig.credentialsJson as Record<string, unknown>)
        : {};

    const secretId =
      this.pickString(credentials.secretId) ||
      this.pickString(credentials.secret_id) ||
      this.pickString(credentials.tencentSecretId);
    const secretKey =
      this.pickString(credentials.secretKey) ||
      this.pickString(credentials.secret_key) ||
      this.pickString(credentials.tencentSecretKey);
    const subAppIdValue =
      credentials.subAppId ?? credentials.sub_app_id ?? credentials.tencentSubAppId;

    const subAppId = Number(subAppIdValue);
    if (!secretId || !secretKey || !Number.isFinite(subAppId) || subAppId <= 0) {
      throw new AppException(
        'PROVIDER_CREDENTIALS_INVALID',
        `Channel ${route.channelKey} is missing Tencent VOD secretId/secretKey/subAppId`,
        500,
      );
    }

    const endpointRaw =
      route.channelConfig.baseUrl ||
      this.pickString(credentials.endpoint) ||
      'https://vod.tencentcloudapi.com';

    return {
      secretId,
      secretKey,
      sessionToken: this.pickString(credentials.sessionToken) || this.pickString(credentials.session_token),
      endpoint: this.normalizeEndpoint(endpointRaw),
      region: this.pickString(credentials.region),
      apiVersion: this.pickString(credentials.apiVersion) || '2018-07-17',
      subAppId: Math.floor(subAppId),
      timeoutMs: route.channelConfig.timeoutMs ?? 30000,
    };
  }

  private async callTencentApi(
    config: TencentVodChannelConfig,
    action: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const payload = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const authorization = buildTencentVodAuthorization(config, action, payload, timestamp, date);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const headers: Record<string, string> = {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        'X-TC-Action': action,
        'X-TC-Version': config.apiVersion,
        'X-TC-Timestamp': String(timestamp),
      };
      if (config.region) {
        headers['X-TC-Region'] = config.region;
      }
      if (config.sessionToken) {
        headers['X-TC-Token'] = config.sessionToken;
      }

      const response = await fetch(`https://${config.endpoint}/`, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
      });
      const text = await response.text().catch(() => '');
      let parsed: Record<string, unknown> = {};
      if (text) {
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          parsed = { raw: text };
        }
      }

      if (!response.ok) {
        this.logger.warn(
          `Tencent VOD request failed: action=${action}, status=${response.status}, body=${JSON.stringify(parsed)}`,
        );
        throw new AppException(
          'PROVIDER_UPSTREAM_ERROR',
          `Tencent VOD ${action} failed with HTTP ${response.status}`,
          502,
          parsed,
        );
      }

      const payloadResponse =
        parsed.Response && typeof parsed.Response === 'object' && !Array.isArray(parsed.Response)
          ? (parsed.Response as Record<string, unknown>)
          : parsed;

      const tencentError =
        payloadResponse.Error &&
        typeof payloadResponse.Error === 'object' &&
        !Array.isArray(payloadResponse.Error)
          ? (payloadResponse.Error as Record<string, unknown>)
          : null;
      if (tencentError) {
        this.logger.warn(
          `Tencent VOD upstream error: action=${action}, body=${JSON.stringify(payloadResponse)}`,
        );
        throw new AppException(
          'PROVIDER_UPSTREAM_ERROR',
          this.pickString(tencentError.Message) || `Tencent VOD ${action} failed`,
          502,
          payloadResponse,
        );
      }

      return payloadResponse;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      this.logger.error(
        `Tencent VOD request crashed: action=${action}, message=${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? `Tencent VOD ${action} request timeout`
          : error instanceof Error
            ? error.message
            : String(error);
      throw new AppException('PROVIDER_NETWORK_ERROR', message, 502, {
        provider: this.providerKey,
        action,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractTencentError(payload: Record<string, unknown>): string | undefined {
    const error =
      payload.Error && typeof payload.Error === 'object' && !Array.isArray(payload.Error)
        ? (payload.Error as Record<string, unknown>)
        : undefined;
    return this.pickString(error?.Message);
  }

  private normalizeEndpoint(raw: string): string {
    let value = raw.trim();
    value = value.replace(/^https?:\/\//i, '');
    value = value.replace(/\/+.*$/, '');
    return value.toLowerCase() || 'vod.tencentcloudapi.com';
  }

  private pickString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private pickIdentifier(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }
}
