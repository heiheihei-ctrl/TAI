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

/**
 * 91model OpenAI 兼容生图 size：仅使用常见合法档位（字母 x）。
 * 自定义像素易触发「请求参数无效」。
 */
const GPT_IMAGE_2_ALLOWED_SIZES = new Set([
  '1024x1024',
  '1536x1024',
  '1024x1536',
]);

const GPT_IMAGE_2_RATIO_TO_SIZE: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1536x1024',
  '9:16': '1024x1536',
  '4:3': '1536x1024',
  '3:4': '1024x1536',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '5:4': '1536x1024',
  '4:5': '1024x1536',
  '2:1': '1536x1024',
  '1:2': '1024x1536',
  '21:9': '1536x1024',
  '9:21': '1024x1536',
};

@Injectable()
export class TianyiCloudService {
  private readonly logger = new Logger(TianyiCloudService.name);
  /** Seedance / gpt-image-2（91model.ai）共用钥匙与网关 */
  private readonly seedanceApiKey: string;
  private readonly seedanceBaseUrl: string;
  private readonly seedance20Model: string;
  private readonly seedance25Model: string;
  private readonly seedanceWatermark: boolean;
  private readonly gptImage2Model: string;

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
    this.gptImage2Model =
      this.config.get<string>('TIANYI_GPT_IMAGE_2_MODEL')?.trim() ||
      'gpt-image-2';

    if (getDeploymentBrand() === 'linglong' && !this.seedanceApiKey) {
      this.logger.warn(
        'DEPLOYMENT_BRAND=linglong but TIANYI_SEEDANCE_API_KEY is empty. Seedance / gpt-image-2 will fail until configured.',
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
        '91model 接口仅在 DEPLOYMENT_BRAND=linglong 下可用',
      );
    }
  }

  getGptImage2Model(): string {
    return this.gptImage2Model;
  }

  /**
   * 将节点比例映射为 91model `WIDTHxHEIGHT`（小写 x）。
   * 仅输出允许的尺寸集合，避免上游「请求参数无效」。
   */
  resolveGptImage2Size(aspectRatio?: string, _resolution?: string): string {
    const rawSize = typeof aspectRatio === 'string' ? aspectRatio.trim() : '';
    if (/^\d{2,5}x\d{2,5}$/i.test(rawSize)) {
      const normalized = rawSize.toLowerCase();
      if (GPT_IMAGE_2_ALLOWED_SIZES.has(normalized)) return normalized;
      // 非白名单像素：按横竖比落到最近合法档
      const [wRaw, hRaw] = normalized.split('x');
      const w = Number(wRaw);
      const h = Number(hRaw);
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        if (Math.abs(w - h) / Math.max(w, h) < 0.08) return '1024x1024';
        return w > h ? '1536x1024' : '1024x1536';
      }
      return '1024x1024';
    }

    const ratioKey = (rawSize || '1:1').replace(/\s+/g, '');
    return GPT_IMAGE_2_RATIO_TO_SIZE[ratioKey] || '1024x1024';
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

  /**
   * Linglong gpt-image-2：POST /v1/images/generations
   * 请求体严格对齐文档字段：
   * model / prompt / n / size / quality / response_format / style / image|images / mask / stream / watermark
   */
  async generateGptImage2(params: {
    prompt: string;
    size?: string;
    n?: number;
    quality?: string;
    responseFormat?: 'url' | 'b64_json';
    style?: string;
    images?: string[];
    mask?: string;
    stream?: boolean;
    watermark?: boolean;
    model?: string;
  }): Promise<{ imageUrl: string; model: string }> {
    this.assertLinglongCreateAllowed();
    this.assertSeedanceConfigured();

    const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : '';
    if (!prompt) {
      throw new BadRequestException('gpt-image-2 需要提供 prompt');
    }

    const model =
      (typeof params.model === 'string' && params.model.trim()) ||
      this.gptImage2Model;
    const size = this.resolveGptImage2Size(params.size);
    const n =
      typeof params.n === 'number' && Number.isFinite(params.n)
        ? Math.max(1, Math.min(4, Math.floor(params.n)))
        : 1;

    // 必填 + 常用可选：只放文档列出的字段
    const payload: Record<string, unknown> = {
      model,
      prompt,
      n,
      size,
      response_format: params.responseFormat === 'b64_json' ? 'b64_json' : 'url',
    };

    const qualityRaw =
      typeof params.quality === 'string' ? params.quality.trim().toLowerCase() : '';
    if (qualityRaw === 'low' || qualityRaw === 'medium' || qualityRaw === 'high') {
      payload.quality = qualityRaw;
    }

    const styleRaw =
      typeof params.style === 'string' ? params.style.trim().toLowerCase() : '';
    if (styleRaw === 'vivid' || styleRaw === 'natural') {
      payload.style = styleRaw;
    }

    if (params.stream === true) {
      payload.stream = true;
    }

    if (typeof params.watermark === 'boolean') {
      payload.watermark = params.watermark;
    }

    if (typeof params.mask === 'string' && params.mask.trim()) {
      payload.mask = params.mask.trim();
    }

    const imageList = Array.isArray(params.images)
      ? params.images
          .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
          .map((u) => u.trim())
      : [];
    // 单张用 image；多张用 images。不要两个字段混发、不要把数组塞进 image。
    if (imageList.length === 1) {
      payload.image = imageList[0];
    } else if (imageList.length > 1) {
      payload.images = imageList;
    }

    const requestUrl = this.buildSeedanceUrl('/v1/images/generations');
    this.logger.log(
      `gpt-image-2 create model=${model}, size=${size}, n=${n}, quality=${String(
        payload.quality || '-',
      )}, images=${imageList.length}, url=${requestUrl}`,
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
      const requestId =
        error.request_id ||
        error.requestId ||
        error.id ||
        error.error?.request_id ||
        error.error?.requestId;
      const baseMessage =
        error.error?.message || error.message || error.rawText || `HTTP ${response.status}`;
      const message = requestId
        ? `${String(baseMessage)} (request id: ${String(requestId)})`
        : String(baseMessage);
      if (response.status >= 400 && response.status < 500) {
        throw new BadRequestException(message);
      }
      throw new BadGatewayException(message);
    }

    const data = await response.json();
    const imageUrl = this.extractGptImage2Url(data);
    if (!imageUrl) {
      this.logger.error(
        `gpt-image-2 empty image payload: ${JSON.stringify(data).slice(0, 500)}`,
      );
      throw new ServiceUnavailableException('gpt-image-2 未返回图片');
    }

    return { imageUrl, model };
  }

  private extractGptImage2Url(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') return undefined;
    const root = payload as Record<string, unknown>;

    const pickFromItem = (item: unknown): string | undefined => {
      if (!item || typeof item !== 'object') return undefined;
      const row = item as Record<string, unknown>;
      const url =
        (typeof row.url === 'string' && row.url.trim()) ||
        (typeof row.image_url === 'string' && row.image_url.trim()) ||
        (typeof row.imageUrl === 'string' && row.imageUrl.trim()) ||
        '';
      if (url) return url;
      const b64 =
        (typeof row.b64_json === 'string' && row.b64_json.trim()) ||
        (typeof row.b64Json === 'string' && row.b64Json.trim()) ||
        (typeof row.base64 === 'string' && row.base64.trim()) ||
        '';
      if (b64) {
        return b64.startsWith('data:')
          ? b64
          : `data:image/png;base64,${b64}`;
      }
      return undefined;
    };

    const data = root.data;
    if (Array.isArray(data) && data.length > 0) {
      const fromFirst = pickFromItem(data[0]);
      if (fromFirst) return fromFirst;
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const nested = data as Record<string, unknown>;
      const fromNested = pickFromItem(nested);
      if (fromNested) return fromNested;
      if (Array.isArray(nested.data) && nested.data.length > 0) {
        const fromDeep = pickFromItem(nested.data[0]);
        if (fromDeep) return fromDeep;
      }
    }

    const direct =
      (typeof root.url === 'string' && root.url.trim()) ||
      (typeof root.image_url === 'string' && root.image_url.trim()) ||
      (typeof root.imageUrl === 'string' && root.imageUrl.trim()) ||
      '';
    return direct || undefined;
  }
}
