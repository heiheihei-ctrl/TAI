import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getDeploymentBrand } from '../../config/deployment-brand';

export const TIANYI_SEEDANCE_TASK_PREFIX = 'tianyi-seedance:';

export type TianyiSeedanceModelVersion = '2.0' | '2.5';

@Injectable()
export class TianyiCloudService {
  private readonly logger = new Logger(TianyiCloudService.name);
  /** Seedance（91model.ai） */
  private readonly seedanceApiKey: string;
  private readonly seedanceBaseUrl: string;
  private readonly seedance20Model: string;
  private readonly seedance25Model: string;
  private readonly seedanceWatermark: boolean;

  constructor(private readonly config: ConfigService) {
    this.seedanceApiKey = this.normalizeApiKey(
      this.config.get<string>('TIANYI_SEEDANCE_API_KEY') || '',
    );
    this.seedanceBaseUrl = this.normalizeEndpoint(
      this.config.get<string>('TIANYI_SEEDANCE_BASE_URL') ||
        'https://91model.ai',
    );
    this.seedance20Model =
      this.config.get<string>('TIANYI_SEEDANCE_20_MODEL')?.trim() ||
      'doubao-seedance-2-0';
    this.seedance25Model =
      this.config.get<string>('TIANYI_SEEDANCE_25_MODEL')?.trim() ||
      'doubao-seedance-2-5';
    this.seedanceWatermark = this.parseBooleanEnv(
      this.config.get<string>('TIANYI_SEEDANCE_WATERMARK'),
      false,
    );

    if (getDeploymentBrand() === 'linglong' && !this.seedanceApiKey) {
      this.logger.warn(
        'DEPLOYMENT_BRAND=linglong but TIANYI_SEEDANCE_API_KEY is empty. Seedance will fail until configured.',
      );
    }
  }

  isSeedanceConfigured(): boolean {
    return this.seedanceApiKey.length > 0;
  }

  getSeedanceBaseUrl(): string {
    return this.seedanceBaseUrl;
  }

  resolveSeedanceModel(modelVersion: TianyiSeedanceModelVersion): string {
    if (modelVersion === '2.5') {
      if (!this.seedance25Model) {
        throw new ServiceUnavailableException(
          '未配置 TIANYI_SEEDANCE_25_MODEL，请在 backend .env 填写 Seedance 2.5 模型调用名（如 doubao-seedance-2-5）',
        );
      }
      return this.seedance25Model;
    }

    if (!this.seedance20Model) {
      throw new ServiceUnavailableException(
        '未配置 TIANYI_SEEDANCE_20_MODEL，请在 backend .env 填写 Seedance 2.0 模型调用名（如 doubao-seedance-2-0）',
      );
    }
    return this.seedance20Model;
  }

  assertSeedanceConfigured(): void {
    if (!this.seedanceApiKey) {
      throw new ServiceUnavailableException(
        'Seedance API Key 未配置（请填写 TIANYI_SEEDANCE_API_KEY）',
      );
    }
  }

  /** 新建任务仅允许 linglong；历史任务查询不受此限。 */
  private assertLinglongCreateAllowed(): void {
    if (getDeploymentBrand() !== 'linglong') {
      throw new BadRequestException(
        'Seedance 91model 接口仅在 DEPLOYMENT_BRAND=linglong 下可用',
      );
    }
  }

  private normalizeApiKey(value?: string): string {
    if (!value) return '';
    let key = value.trim();
    if (
      (key.startsWith('"') && key.endsWith('"')) ||
      (key.startsWith("'") && key.endsWith("'"))
    ) {
      key = key.slice(1, -1).trim();
    }
    if (/^Bearer\s+/i.test(key)) {
      key = key.replace(/^Bearer\s+/i, '').trim();
    }
    return key;
  }

  private normalizeEndpoint(endpoint: string): string {
    return endpoint.trim().replace(/\/+$/, '');
  }

  private parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined || raw.trim() === '') return fallback;
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
  }

  private buildSeedanceUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.seedanceBaseUrl}${normalizedPath}`;
  }

  /** Node fetch 网络失败时常只有 "fetch failed"，把 cause code 带上便于排查 */
  private formatFetchNetworkError(error: unknown, requestUrl: string): string {
    const err = error instanceof Error ? error : new Error(String(error));
    const cause = (err as Error & { cause?: { code?: string; message?: string; errno?: string } })
      .cause;
    const causeDetail =
      (typeof cause?.code === 'string' && cause.code) ||
      (typeof cause?.errno === 'string' && cause.errno) ||
      (typeof cause?.message === 'string' && cause.message) ||
      '';
    const base = err.message || 'fetch failed';
    const detail = causeDetail && causeDetail !== base ? `${base} (${causeDetail})` : base;
    return `上游请求失败: ${detail}; url=${requestUrl}`;
  }

  private async fetchTianyi(
    requestUrl: string,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(requestUrl, init);
    } catch (error) {
      const message = this.formatFetchNetworkError(error, requestUrl);
      this.logger.error(message);
      throw new BadGatewayException(message);
    }
  }

  async createSeedanceTask(params: {
    modelVersion: TianyiSeedanceModelVersion;
    content: Array<Record<string, unknown>>;
    ratio?: string;
    duration?: number;
    resolution?: string;
    generateAudio?: boolean;
    watermark?: boolean;
    cameraFixed?: boolean;
    returnLastFrame?: boolean;
    serviceTier?: string;
    callbackUrl?: string;
  }): Promise<{ taskId: string; status: 'queued' }> {
    this.assertLinglongCreateAllowed();
    this.assertSeedanceConfigured();

    if (!Array.isArray(params.content) || params.content.length === 0) {
      throw new BadRequestException('Seedance 需要提供提示词或至少一种参考素材');
    }

    const model = this.resolveSeedanceModel(params.modelVersion);

    // 对齐 91model.ai curl：model / content / duration / ratio / resolution
    const payload: Record<string, unknown> = {
      model,
      content: params.content,
    };

    if (typeof params.ratio === 'string' && params.ratio.trim()) {
      payload.ratio = params.ratio.trim();
    }
    if (typeof params.duration === 'number' && Number.isFinite(params.duration)) {
      payload.duration = Math.round(params.duration);
    }
    if (typeof params.resolution === 'string' && params.resolution.trim()) {
      payload.resolution = params.resolution.trim().toLowerCase();
    }

    payload.watermark =
      typeof params.watermark === 'boolean'
        ? params.watermark
        : this.seedanceWatermark;

    // 2.0 文档：不支持 frames / seed；camera_fixed / generate_audio 可选
    if (typeof params.cameraFixed === 'boolean') {
      payload.camera_fixed = params.cameraFixed;
    }
    if (typeof params.generateAudio === 'boolean') {
      payload.generate_audio = params.generateAudio;
    }

    if (typeof params.returnLastFrame === 'boolean') {
      payload.return_last_frame = params.returnLastFrame;
    }
    if (typeof params.serviceTier === 'string' && params.serviceTier.trim()) {
      payload.service_tier = params.serviceTier.trim();
    }
    if (typeof params.callbackUrl === 'string' && params.callbackUrl.trim()) {
      payload.callback_url = params.callbackUrl.trim();
    }

    const requestUrl = this.buildSeedanceUrl('/v1/contents/generations/tasks');
    this.logger.log(
      `Seedance create model=${model}, version=${params.modelVersion}, url=${requestUrl}`,
    );

    const response = await this.fetchTianyi(requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.seedanceApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const rawText = await response.text().catch(() => '');
      let error: any = {};
      try {
        error = rawText ? JSON.parse(rawText) : {};
      } catch {
        error = { rawText };
      }
      const message =
        error.error?.message || error.message || error.rawText || `HTTP ${response.status}`;
      if (response.status >= 400 && response.status < 500) {
        throw new BadRequestException(String(message));
      }
      throw new BadGatewayException(String(message));
    }

    const data = await response.json();
    const rawTaskId = data?.id || data?.platform_id || data?.task_id;
    if (!rawTaskId) {
      throw new ServiceUnavailableException('Seedance 未返回 taskId');
    }

    return {
      taskId: `${TIANYI_SEEDANCE_TASK_PREFIX}${String(rawTaskId)}`,
      status: 'queued',
    };
  }

  async querySeedanceTask(taskId: string): Promise<{
    status: string;
    videoUrl?: string;
    error?: string;
  }> {
    this.assertSeedanceConfigured();

    const rawTaskId = taskId.startsWith(TIANYI_SEEDANCE_TASK_PREFIX)
      ? taskId.slice(TIANYI_SEEDANCE_TASK_PREFIX.length)
      : taskId;
    if (!rawTaskId) {
      return { status: 'processing' };
    }

    const requestUrl = this.buildSeedanceUrl(
      `/v1/contents/generations/tasks/${encodeURIComponent(rawTaskId)}`,
    );
    const response = await this.fetchTianyi(requestUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.seedanceApiKey}`,
      },
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      this.logger.warn(
        `Seedance query failed taskId=${rawTaskId}, http=${response.status}, body=${message.slice(0, 300)}`,
      );
      return { status: 'processing' };
    }

    const data = await response.json();
    const status = String(data?.status || 'processing').toLowerCase();

    if (status === 'succeeded' || status === 'success' || status === 'completed') {
      const videoUrl =
        data?.content?.video_url ||
        data?.content?.videoUrl ||
        data?.video_url ||
        data?.videoUrl ||
        data?.data?.video_url ||
        data?.data?.videoUrl;
      if (!videoUrl || typeof videoUrl !== 'string') {
        throw new ServiceUnavailableException('Seedance 返回空视频链接');
      }
      return { status: 'succeeded', videoUrl };
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      return {
        status: 'failed',
        error:
          data?.error?.message ||
          data?.reason ||
          data?.message ||
          'Seedance 生成失败',
      };
    }

    return { status: 'processing' };
  }
}
