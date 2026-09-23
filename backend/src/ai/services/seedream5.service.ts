import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { getDeploymentBrand } from '../../config/deployment-brand';
import { TianyiCloudService } from './tianyi-cloud.service';
import {
  buildToapisUrl,
  getToapisApiBaseUrl,
  getToapisApiKey,
  toapisRequest,
  formatToapisHttpError,
} from '../../utils/toapisHttpClient';
import {
  extractUpstreamImageTaskId,
  extractUpstreamImageTaskStatus,
  extractUpstreamImageTaskError,
  extractUpstreamImageUrl,
  isUpstreamImageTaskCompleted,
  isUpstreamImageTaskFailed,
} from '../../utils/upstreamImageTask.util';

export type Seedream5ProviderType = 'doubao' | 'watcha' | 'tianyi' | 'toapis';
export const SEEDREAM5_PROVIDER_SETTING_KEY = 'seedream5_provider';

interface Seedream5ProviderConfig {
  provider: Seedream5ProviderType;
  endpoint: string;
  apiKey: string;
  model: string;
  generationPath: string;
  watermark: boolean;
}

@Injectable()
export class Seedream5Service {
  private readonly logger = new Logger(Seedream5Service.name);
  private readonly doubaoApiKey: string;
  private readonly doubaoEndpoint: string;
  private readonly watchaApiKey: string;
  private readonly watchaEndpoint: string;
  private readonly watchaModel: string;

  private static readonly SIZE_PRESETS = new Set(['1K', '1.5K', '2K', '3K', '4K']);
  private static readonly DIMENSION_PATTERN = /^(\d{3,5})\s*[xX]\s*(\d{3,5})$/;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tianyiCloudService: TianyiCloudService,
  ) {
    this.doubaoApiKey = this.normalizeApiKey(
      this.config.get<string>('ARK_API_KEY') ||
        this.config.get<string>('DOUBAO_API_KEY') ||
        '',
    );
    this.doubaoEndpoint = this.normalizeEndpoint(
      this.config.get<string>('ARK_ENDPOINT') || 'https://ark.cn-beijing.volces.com',
    );

    this.watchaApiKey = this.normalizeApiKey(
      this.config.get<string>('WATCHA_SEEDREAM_API_KEY') ||
        this.config.get<string>('WATCHA_API_KEY') ||
        '',
    );
    this.watchaEndpoint = this.normalizeEndpoint(
      this.config.get<string>('WATCHA_SEEDREAM_ENDPOINT') ||
        'https://tokendance.agent-universe.cn/gateway/ark',
    );
    this.watchaModel =
      this.config.get<string>('WATCHA_SEEDREAM_MODEL')?.trim() || 'seedream-5.0-lite';

    if (!this.doubaoApiKey) {
      this.logger.warn(
        'Doubao Seedream key missing. Please set ARK_API_KEY (or DOUBAO_API_KEY).',
      );
    }
    if (!this.watchaApiKey) {
      this.logger.warn(
        'Watcha Seedream key missing. Please set WATCHA_SEEDREAM_API_KEY.',
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

  private buildUrl(base: string, path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }

  private normalizeSize(size?: string): string {
    const raw = typeof size === 'string' ? size.trim() : '';
    if (!raw) return '2K';

    const compact = raw.replace(/\s+/g, '');
    const upper = compact.toUpperCase();
    if (Seedream5Service.SIZE_PRESETS.has(upper)) {
      return upper;
    }

    const dimMatch = compact.match(Seedream5Service.DIMENSION_PATTERN);
    if (dimMatch) {
      const width = Number.parseInt(dimMatch[1], 10);
      const height = Number.parseInt(dimMatch[2], 10);
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return `${width}x${height}`;
      }
    }

    this.logger.warn(`Seedream5 size "${raw}" is invalid, fallback to 2K`);
    return '2K';
  }

  private normalizeSizeForProvider(
    provider: Seedream5ProviderType,
    size: string,
  ): string {
    if (provider === 'watcha' && size.toUpperCase() === '3K') {
      this.logger.warn('Watcha Seedream does not document 3K size, fallback to 2K');
      return '2K';
    }
    return size;
  }

  private async getConfiguredProvider(): Promise<Seedream5ProviderType> {
    try {
      const setting = await this.prisma.systemSetting.findUnique({
        where: { key: SEEDREAM5_PROVIDER_SETTING_KEY },
      });
      if (setting && (setting.value === 'doubao' || setting.value === 'watcha')) {
        return setting.value;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to read seedream5 provider setting: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
    return 'doubao';
  }

  private async resolveProviderConfig(
    overrideModel?: string,
    imageRoute?: 'normal' | 'stable',
  ): Promise<Seedream5ProviderConfig> {
    if (getDeploymentBrand() === 'linglong') {
      if (!this.tianyiCloudService.isConfigured()) {
        throw new Error(
          'DEPLOYMENT_BRAND=linglong requires TIANYI_CLOUD_API_KEY for Seedream',
        );
      }
      return {
        provider: 'tianyi',
        endpoint: this.tianyiCloudService.getBaseUrl(),
        apiKey: this.tianyiCloudService.getApiKey(),
        // linglong 统一使用天翼云配置的模型名，忽略 Pro/Lite 内部型号覆盖
        model: this.tianyiCloudService.getSeedreamModel(),
        generationPath: '/v1/images/generations',
        watermark: this.tianyiCloudService.getSeedreamWatermark(),
      };
    }

    const isProModel = Boolean(overrideModel?.includes('seedream-5-0-pro'));

    // 普通路线：统一走 ToAPIs；尊享（stable / 未指定）走火山方舟
    if (imageRoute === 'normal') {
      const apiKey = getToapisApiKey();
      if (!apiKey) {
        throw new Error('Seedream5 普通线路未配置 TOAPIS_TOKEN');
      }
      return {
        provider: 'toapis',
        endpoint: getToapisApiBaseUrl(),
        apiKey,
        model: isProModel ? 'doubao-seedream-5-0-pro' : 'doubao-seedream-5-0',
        generationPath: '/images/generations',
        watermark: false,
      };
    }

    const provider = isProModel ? 'doubao' : await this.getConfiguredProvider();

    if (provider === 'watcha') {
      if (!this.watchaApiKey) {
        throw new Error(
          'Seedream5 watcha provider selected, but WATCHA_SEEDREAM_API_KEY is not configured',
        );
      }
      return {
        provider: 'watcha',
        endpoint: this.watchaEndpoint,
        apiKey: this.watchaApiKey,
        model: overrideModel || this.watchaModel,
        generationPath: '/v3/images/generations',
        watermark: false,
      };
    }

    if (!this.doubaoApiKey) {
      throw new Error('Seedream5 Doubao key not configured (ARK_API_KEY or DOUBAO_API_KEY)');
    }
    return {
      provider: 'doubao',
      endpoint: this.doubaoEndpoint,
      apiKey: this.doubaoApiKey,
      model:
        overrideModel ||
        (isProModel
          ? 'doubao-seedream-5-0-pro-260628'
          : 'doubao-seedream-5-0-260128'),
      generationPath: '/api/v3/images/generations',
      watermark: false,
    };
  }

  async getProviderExecutionInfo(overrideModel?: string, imageRoute?: 'normal' | 'stable'): Promise<{
    provider: Seedream5ProviderType;
    model: string;
    endpoint: string;
  }> {
    const config = await this.resolveProviderConfig(overrideModel, imageRoute);
    return {
      provider: config.provider,
      model: config.model,
      endpoint: config.endpoint,
    };
  }

  async generateImage(params: {
    prompt?: string;
    size?: string;
    image_urls?: string[];
    batchMode?: boolean;
    batchCount?: number;
    model?: string;
    imageRoute?: 'normal' | 'stable';
    aspectRatio?: string;
    layerDecomposition?: boolean;
    watermark?: boolean;
  }): Promise<{ imageUrl?: string; imageUrls?: string[] }> {
    const providerConfig = await this.resolveProviderConfig(params.model, params.imageRoute);

    if (providerConfig.provider === 'toapis') {
      if (params.layerDecomposition) {
        throw new Error('图层拆分仅支持 linglong 天翼云 Seedream');
      }
      return this.generateToapisImage(providerConfig, params);
    }

    if (providerConfig.provider === 'tianyi') {
      return this.tianyiCloudService.generateSeedreamImage({
        prompt: params.prompt,
        size: this.normalizeSize(params.size),
        imageUrls: params.image_urls,
        model: providerConfig.model,
        layerDecomposition: params.layerDecomposition === true,
        watermark:
          typeof params.watermark === 'boolean'
            ? params.watermark
            : params.layerDecomposition
              ? false
              : undefined,
      });
    }

    if (params.layerDecomposition) {
      throw new Error('图层拆分仅支持 linglong 天翼云 Seedream');
    }

    const normalizedSize = this.normalizeSizeForProvider(
      providerConfig.provider,
      this.normalizeSize(params.size),
    );

    // Seedream 5.0 Pro 不支持 sequential_image_generation（文生组图），传 disabled 也会被拒绝
    const isProModel = providerConfig.model.includes('-pro-');

    const payload: any = {
      model: providerConfig.model,
      response_format: 'url',
      size: normalizedSize,
      stream: false,
      watermark: providerConfig.watermark,
    };

    if (!isProModel) {
      payload.sequential_image_generation = params.batchMode ? 'auto' : 'disabled';
      if (params.batchMode && params.batchCount) {
        payload.sequential_image_generation_options = {
          max_images: Math.min(Math.max(params.batchCount, 2), 10),
        };
      }
    }

    if (params.prompt) {
      payload.prompt = params.prompt;
    }

    if (params.image_urls && params.image_urls.length > 0) {
      payload.image =
        params.image_urls.length === 1
          ? params.image_urls[0]
          : params.image_urls.slice(0, 5);
    }

    const requestUrl = this.buildUrl(providerConfig.endpoint, providerConfig.generationPath);
    this.logger.log(
      `Seedream5 request provider=${providerConfig.provider}, model=${providerConfig.model}, size=${normalizedSize}, imageCount=${params.image_urls?.length || 0}, batchMode=${!!params.batchMode}, url=${requestUrl}`,
    );

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Seedream5 ${providerConfig.provider}: ${error.error?.message || error.message || `HTTP ${response.status}`}`);
    }

    const data = await response.json();
    const images = Array.isArray(data.data) ? data.data : [];
    const imageUrls = images
      .map((img: any) => (typeof img?.url === 'string' ? img.url : ''))
      .filter((url: string) => !!url);

    if (imageUrls.length === 1) {
      return { imageUrl: imageUrls[0] };
    }
    if (imageUrls.length > 1) {
      return { imageUrls };
    }

    throw new Error('No image URL returned from Seedream5 provider');
  }

  private async generateToapisImage(
    config: Seedream5ProviderConfig,
    params: { prompt?: string; size?: string; aspectRatio?: string; image_urls?: string[] },
  ): Promise<{ imageUrl: string }> {
    const signal = AbortSignal.timeout(5 * 60 * 1000);
    const request = async (url: string, data?: Record<string, unknown>) => {
      const response = await toapisRequest<any>({
        url,
        method: data ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        data,
        timeout: data ? 120000 : 30000,
        signal,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(formatToapisHttpError(response.status, response.statusText, response.data));
      }
      return response.data;
    };
    let data = await request(buildToapisUrl('/images/generations'), {
      model: config.model,
      prompt: params.prompt || '',
      size: params.aspectRatio || '1:1',
      resolution: this.normalizeSize(params.size),
      n: 1,
      ...(params.image_urls?.length ? { image_urls: params.image_urls.slice(0, 5) } : {}),
    });
    const taskId = extractUpstreamImageTaskId(data);
    for (;;) {
      const status = extractUpstreamImageTaskStatus(data);
      const error = extractUpstreamImageTaskError(data);
      if (isUpstreamImageTaskFailed(status) || error) {
        throw new Error(`Seedream5 ToAPIs: ${error || status}`);
      }
      const imageUrl = extractUpstreamImageUrl(data) || data?.data?.[0]?.url;
      if (typeof imageUrl === 'string' && imageUrl.trim()) return { imageUrl: imageUrl.trim() };
      if (isUpstreamImageTaskCompleted(status) || !taskId) {
        throw new Error('Seedream5 ToAPIs 未返回图片 URL');
      }
      signal.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      data = await request(buildToapisUrl(`/images/generations/${encodeURIComponent(taskId)}`));
    }
  }

  async queryTask(taskId: string): Promise<{
    status: string;
    imageUrl?: string;
    imageUrls?: string[];
  }> {
    const providerConfig = await this.resolveProviderConfig();
    const response = await fetch(
      `${this.buildUrl(providerConfig.endpoint, providerConfig.generationPath)}/${taskId}`,
      {
        headers: { Authorization: `Bearer ${providerConfig.apiKey}` },
      },
    );

    if (!response.ok) {
      throw new Error(`Query failed: HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'succeeded' || data.status === 'completed') {
      const images = Array.isArray(data.data) ? data.data : [];
      const imageUrls = images
        .map((img: any) => (typeof img?.url === 'string' ? img.url : ''))
        .filter((url: string) => !!url);

      if (imageUrls.length === 1) {
        return { status: 'succeeded', imageUrl: imageUrls[0] };
      }
      if (imageUrls.length > 1) {
        return { status: 'succeeded', imageUrls };
      }
    }

    if (data.status === 'failed') {
      return { status: 'failed' };
    }

    return { status: data.status || 'processing' };
  }
}
