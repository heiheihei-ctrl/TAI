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

export type TianyiSeedanceModelVersion = '1.5-pro' | '2.0' | '2.0-fast' | '2.5';

@Injectable()
export class TianyiCloudService {
  private readonly logger = new Logger(TianyiCloudService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly seedreamModel: string;
  private readonly seedance20Model: string;
  private readonly seedance25Model: string;
  private readonly seedreamWatermark: boolean;
  private readonly seedanceWatermark: boolean;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.normalizeApiKey(
      this.config.get<string>('TIANYI_CLOUD_API_KEY') || '',
    );
    this.baseUrl = this.normalizeEndpoint(
      this.config.get<string>('TIANYI_CLOUD_BASE_URL') || 'https://ai.ctaigw.cn',
    );
    this.seedreamModel =
      this.config.get<string>('TIANYI_SEEDREAM_MODEL')?.trim() ||
      'doubao-seedream-5.0-pro';
    this.seedance20Model =
      this.config.get<string>('TIANYI_SEEDANCE_20_MODEL')?.trim() || '';
    this.seedance25Model =
      this.config.get<string>('TIANYI_SEEDANCE_25_MODEL')?.trim() || '';
    this.seedreamWatermark = this.parseBooleanEnv(
      this.config.get<string>('TIANYI_SEEDREAM_WATERMARK'),
      true,
    );
    this.seedanceWatermark = this.parseBooleanEnv(
      this.config.get<string>('TIANYI_SEEDANCE_WATERMARK'),
      false,
    );

    if (getDeploymentBrand() === 'linglong' && !this.apiKey) {
      this.logger.warn(
        'DEPLOYMENT_BRAND=linglong but TIANYI_CLOUD_API_KEY is empty. Seedream/Seedance will fail until configured.',
      );
    }
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  getSeedreamModel(): string {
    return this.seedreamModel;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getSeedreamWatermark(): boolean {
    return this.seedreamWatermark;
  }

  resolveSeedanceModel(modelVersion: TianyiSeedanceModelVersion): string {
    if (modelVersion === '2.5') {
      if (!this.seedance25Model) {
        throw new ServiceUnavailableException(
          '未配置 TIANYI_SEEDANCE_25_MODEL，请在 backend .env 填写天翼云 Seedance 2.5 模型调用名',
        );
      }
      return this.seedance25Model;
    }

    // 2.0 / 2.0-fast / 1.5-pro 共用 2.0 配置项（玲珑主要使用 2.0/2.5）
    if (!this.seedance20Model) {
      throw new ServiceUnavailableException(
        '未配置 TIANYI_SEEDANCE_20_MODEL，请在 backend .env 填写天翼云 Seedance 2.0 模型调用名',
      );
    }
    return this.seedance20Model;
  }

  assertConfigured(): void {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        '天翼云 API Key 未配置（TIANYI_CLOUD_API_KEY）',
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

  private buildUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${normalizedPath}`;
  }

  async generateSeedreamImage(params: {
    prompt?: string;
    size?: string;
    imageUrls?: string[];
    model?: string;
  }): Promise<{ imageUrl?: string; imageUrls?: string[] }> {
    this.assertConfigured();

    const size = (params.size || '2K').trim() || '2K';
    const model = (params.model || this.seedreamModel).trim() || this.seedreamModel;
    const payload: Record<string, unknown> = {
      model,
      response_format: 'url',
      size,
      stream: false,
      watermark: this.seedreamWatermark,
    };

    if (params.prompt?.trim()) {
      payload.prompt = params.prompt.trim();
    }

    const images = (params.imageUrls || [])
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    if (images.length === 1) {
      payload.image = images[0];
    } else if (images.length > 1) {
      payload.image = images.slice(0, 5);
    }

    const requestUrl = this.buildUrl('/v1/images/generations');
    this.logger.log(
      `Tianyi Seedream request model=${model}, size=${size}, imageCount=${images.length}, url=${requestUrl}`,
    );

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message =
        (error as any)?.error?.message ||
        (error as any)?.message ||
        `HTTP ${response.status}`;
      if (response.status >= 400 && response.status < 500) {
        throw new BadRequestException(String(message));
      }
      throw new BadGatewayException(String(message));
    }

    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    const imageUrls = rows
      .map((img: any) => (typeof img?.url === 'string' ? img.url : ''))
      .filter((url: string) => !!url);

    if (imageUrls.length === 1) {
      return { imageUrl: imageUrls[0] };
    }
    if (imageUrls.length > 1) {
      return { imageUrls };
    }
    throw new ServiceUnavailableException('天翼云 Seedream 未返回图片地址');
  }

  async createSeedanceTask(params: {
    modelVersion: TianyiSeedanceModelVersion;
    content: Array<Record<string, unknown>>;
    ratio?: string;
    duration?: number;
    resolution?: string;
    generateAudio?: boolean;
    watermark?: boolean;
    videoMode?: string;
    cameraFixed?: boolean;
  }): Promise<{ taskId: string; status: 'queued' }> {
    this.assertConfigured();

    if (!Array.isArray(params.content) || params.content.length === 0) {
      throw new BadRequestException('Seedance 需要提供提示词或至少一种参考素材');
    }

    const model = this.resolveSeedanceModel(params.modelVersion);
    const payload: Record<string, unknown> = {
      model,
      content: params.content,
      watermark:
        typeof params.watermark === 'boolean'
          ? params.watermark
          : this.seedanceWatermark,
    };

    if (typeof params.videoMode === 'string' && params.videoMode.trim()) {
      payload.video_mode = params.videoMode.trim();
    }
    if (typeof params.ratio === 'string' && params.ratio.trim()) {
      payload.ratio = params.ratio.trim();
    }
    if (typeof params.duration === 'number' && Number.isFinite(params.duration)) {
      payload.duration = Math.round(params.duration);
    }
    if (typeof params.resolution === 'string' && params.resolution.trim()) {
      payload.resolution = params.resolution.trim().toLowerCase();
    }
    if (typeof params.cameraFixed === 'boolean') {
      payload.camera_fixed = params.cameraFixed;
    }
    if (typeof params.generateAudio === 'boolean') {
      payload.generate_audio = params.generateAudio;
    }

    const requestUrl = this.buildUrl('/v1/contents/generations/tasks');
    this.logger.log(
      `Tianyi Seedance create model=${model}, version=${params.modelVersion}, url=${requestUrl}`,
    );

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
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
      throw new ServiceUnavailableException('天翼云 Seedance 未返回 taskId');
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
    this.assertConfigured();

    const rawTaskId = taskId.startsWith(TIANYI_SEEDANCE_TASK_PREFIX)
      ? taskId.slice(TIANYI_SEEDANCE_TASK_PREFIX.length)
      : taskId;
    if (!rawTaskId) {
      return { status: 'processing' };
    }

    const requestUrl = this.buildUrl(
      `/v1/contents/generations/tasks/${encodeURIComponent(rawTaskId)}`,
    );
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      this.logger.warn(
        `Tianyi Seedance query failed taskId=${rawTaskId}, http=${response.status}, body=${message.slice(0, 300)}`,
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
        throw new ServiceUnavailableException('天翼云 Seedance 返回空视频链接');
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
          '天翼云 Seedance 生成失败',
      };
    }

    return { status: 'processing' };
  }
}
