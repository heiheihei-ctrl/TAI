import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, fetch as undiciFetch } from 'undici';
import { getDeploymentBrand } from '../../config/deployment-brand';

export const TIANYI_SEEDANCE_TASK_PREFIX = 'tianyi-seedance:';

export type TianyiSeedanceModelVersion = '2.0' | '2.5';

/** Linglong 91model：强制直连，不走 API_PROXY_URL / 全局 HTTP(S)_PROXY */
const tianyiDirectDispatcher = new Agent({
  connect: { timeout: 30_000 },
});

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
   * 将节点比例映射为 91model `WIDTHxHEIGHT`（小写 x）或 `auto`。
   * gpt-image-2* 文档：size 支持 auto / 自定义像素；常用档位优先。
   */
  resolveGptImage2Size(aspectRatio?: string, _resolution?: string): string {
    const rawSize = typeof aspectRatio === 'string' ? aspectRatio.trim() : '';
    if (!rawSize || rawSize.toLowerCase() === 'auto') {
      return 'auto';
    }
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

    const ratioKey = rawSize.replace(/\s+/g, '');
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

  /** Node 直连失败时常只有 "fetch failed"，把 cause code 带上便于排查 */
  private formatFetchNetworkError(error: unknown, requestUrl: string): string {
    const err = error instanceof Error ? error : new Error(String(error));
    const cause = (err as Error & { cause?: { code?: string; message?: string; errno?: string } })
      .cause;
    const causeDetail =
      (typeof cause?.code === 'string' && cause.code) ||
      (typeof (err as any)?.code === 'string' && (err as any).code) ||
      (typeof cause?.errno === 'string' && cause.errno) ||
      (typeof cause?.message === 'string' && cause.message) ||
      '';
    const base = err.message || 'fetch failed';
    const detail = causeDetail && causeDetail !== base ? `${base} (${causeDetail})` : base;
    return `上游请求失败: ${detail}; url=${requestUrl}; proxy=direct`;
  }

  private resolveHttpTimeoutMs(): number {
    const raw = this.config.get<string>('TIANYI_HTTP_TIMEOUT_MS');
    const parsed = raw ? Number.parseInt(String(raw).trim(), 10) : NaN;
    if (Number.isFinite(parsed) && parsed >= 10_000 && parsed <= 600_000) {
      return parsed;
    }
    return 180_000;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableNetworkError(error: unknown): boolean {
    const err = error as any;
    const code = String(err?.code || err?.cause?.code || '').toUpperCase();
    const message = String(err?.message || '').toLowerCase();
    if (err?.name === 'AbortError' || message.includes('aborted')) return true;
    return (
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' ||
      code === 'UND_ERR_CONNECT_TIMEOUT' ||
      code === 'UND_ERR_HEADERS_TIMEOUT' ||
      code === 'UND_ERR_BODY_TIMEOUT' ||
      code === 'UND_ERR_SOCKET' ||
      message.includes('etimedout') ||
      message.includes('fetch failed') ||
      message.includes('network')
    );
  }

  /**
   * Linglong 91model：Node 直连，不走 ToAPIs 的 API_PROXY_URL / 全局 HTTP(S)_PROXY。
   * 使用独立 undici Agent，避免 main.ts 里 EnvHttpProxyAgent 劫持出站。
   */
  private async fetchTianyi(
    requestUrl: string,
    init: RequestInit,
  ): Promise<Response> {
    const timeout = this.resolveHttpTimeoutMs();
    const maxAttempts = 3;
    let lastError: unknown;
    const method = String(init.method || 'GET').toUpperCase();
    const headers =
      init.headers && typeof init.headers === 'object' && !(init.headers instanceof Headers)
        ? (init.headers as Record<string, string>)
        : undefined;
    const body = typeof init.body === 'string' ? init.body : undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await undiciFetch(requestUrl, {
          method,
          headers,
          body,
          signal: controller.signal,
          dispatcher: tianyiDirectDispatcher,
        });
        return response as unknown as Response;
      } catch (error) {
        lastError = error;
        const retryable = this.isRetryableNetworkError(error);
        this.logger.warn(
          `91model direct request failed attempt=${attempt}/${maxAttempts} retryable=${retryable} url=${requestUrl} err=${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (!retryable || attempt >= maxAttempts) {
          break;
        }
        await this.sleep(500 * attempt);
      } finally {
        clearTimeout(timer);
      }
    }

    const message = this.formatFetchNetworkError(lastError, requestUrl);
    this.logger.error(message);
    throw new BadGatewayException(message);
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
   * Linglong gpt-image-2：对齐 91model 文档。
   * 文生图 POST /v1/images/generations，body：model/prompt/n/size（勿传 response_format）。
   * 文档明确：response_format 不支持，**只以 b64_json 输出图片**。
   * 图生图/编辑 POST /v1/images/edits（公网 image / images）。
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
  }): Promise<{ imageUrl?: string; imageData?: string; model: string }> {
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

    // 文档 curl 示例仅这四个字段；多余字段（quality/response_format 等）易触发「请求参数无效」
    const payload: Record<string, unknown> = {
      model,
      prompt,
      n,
      size,
    };

    const imageList = Array.isArray(params.images)
      ? params.images
          .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
          .map((u) => u.trim())
          .filter((u) => this.isPublicHttpImageUrl(u))
      : [];

    const hasImages = imageList.length > 0;
    if (hasImages) {
      if (imageList.length === 1) {
        payload.image = imageList[0];
      } else {
        payload.images = imageList;
      }
      if (typeof params.mask === 'string' && params.mask.trim()) {
        const mask = params.mask.trim();
        if (this.isPublicHttpImageUrl(mask)) {
          payload.mask = mask;
        }
      }
    }

    // 文生图 → generations；图生图/编辑 → edits（文档分端点）
    const path = hasImages ? '/v1/images/edits' : '/v1/images/generations';
    const requestUrl = this.buildSeedanceUrl(path);
    this.logger.log(
      `gpt-image-2 create model=${model}, size=${size}, n=${n}, images=${imageList.length}, path=${path}`,
    );
    this.logger.debug(`gpt-image-2 payload=${JSON.stringify(payload)}`);

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
      this.logger.warn(
        `gpt-image-2 upstream error status=${response.status} body=${rawText.slice(0, 400)}`,
      );
      if (response.status >= 400 && response.status < 500) {
        throw new BadRequestException(message);
      }
      throw new BadGatewayException(message);
    }

    const data = await response.json();
    const extracted = this.extractGptImage2Payload(data);
    if (!extracted.imageUrl && !extracted.imageData) {
      const preview = this.safeJsonPreview(data, 800);
      this.logger.error(`gpt-image-2 empty image payload: ${preview}`);
      throw new ServiceUnavailableException(
        `gpt-image-2 未返回可解析图片（keys=${this.summarizePayloadKeys(data)}）`,
      );
    }

    this.logger.log(
      `gpt-image-2 parsed kind=${extracted.imageUrl ? 'url' : 'b64'} urlLen=${
        extracted.imageUrl?.length || 0
      } dataLen=${extracted.imageData?.length || 0}`,
    );

    return {
      imageUrl: extracted.imageUrl,
      imageData: extracted.imageData,
      model,
    };
  }

  /** 91model 只能拉公网 http(s)；拒绝 localhost / 相对路径 / data / blob */
  private isPublicHttpImageUrl(value: string): boolean {
    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    try {
      const host = new URL(trimmed).hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.endsWith('.local')
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private safeJsonPreview(value: unknown, maxLen: number): string {
    try {
      const text = JSON.stringify(value);
      if (!text) return '';
      return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
    } catch {
      return String(value).slice(0, maxLen);
    }
  }

  private summarizePayloadKeys(value: unknown): string {
    if (!value || typeof value !== 'object') return typeof value;
    if (Array.isArray(value)) return `array(len=${value.length})`;
    const keys = Object.keys(value as Record<string, unknown>).slice(0, 20);
    return keys.join(',') || '(empty)';
  }

  private normalizePossibleImageRef(
    raw: unknown,
    opts?: { preferB64?: boolean },
  ): { imageUrl?: string; imageData?: string } | undefined {
    if (typeof raw !== 'string') return undefined;
    // 保留 base64 原串两端 trim；中间空白去掉（部分网关会折行）
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const compact = trimmed.replace(/\s+/g, '');

    if (!opts?.preferB64 && /^https?:\/\//i.test(compact)) {
      return { imageUrl: compact };
    }
    if (/^data:image\//i.test(trimmed)) {
      return { imageData: trimmed.includes('base64,') ? trimmed.replace(/\s+/g, '') : trimmed };
    }
    if (!opts?.preferB64 && compact.startsWith('/')) {
      return { imageUrl: `${this.seedanceBaseUrl}${compact}` };
    }

    // 91model 文档：只出 b64_json。显式 b64 字段或长串都按图片数据收。
    // 兼容标准 base64 与 base64url（-/ _）
    const looksLikeB64 =
      compact.length > 64 &&
      /^[A-Za-z0-9+/_-]+=*$/.test(compact);
    if (opts?.preferB64 || looksLikeB64) {
      return {
        imageData: compact.startsWith('data:')
          ? compact
          : `data:image/png;base64,${compact}`,
      };
    }
    return undefined;
  }

  private pickImageFromUnknown(item: unknown): { imageUrl?: string; imageData?: string } | undefined {
    if (typeof item === 'string') {
      return this.normalizePossibleImageRef(item);
    }
    if (!item || typeof item !== 'object') return undefined;
    const row = item as Record<string, unknown>;

    // 文档：response_format 不支持，只以 b64_json 输出 —— 优先读 b64
    const b64Candidates: unknown[] = [
      row.b64_json,
      row.b64Json,
      row.base64,
      row.image_base64,
      row.imageBase64,
      row.image_data,
      row.imageData,
      typeof row.image === 'string' ? row.image : undefined,
    ];
    for (const candidate of b64Candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        const normalized = this.normalizePossibleImageRef(candidate, { preferB64: true });
        if (normalized?.imageData) return normalized;
      }
    }

    const urlCandidates: unknown[] = [
      row.url,
      row.image_url,
      row.imageUrl,
      row.download_url,
      row.downloadUrl,
      row.file_url,
      row.fileUrl,
      typeof row.image === 'object' && row.image
        ? (row.image as Record<string, unknown>).url
        : undefined,
    ];
    for (const candidate of urlCandidates) {
      if (typeof candidate === 'string') {
        const normalized = this.normalizePossibleImageRef(candidate);
        if (normalized?.imageUrl || normalized?.imageData) return normalized;
      }
    }

    return undefined;
  }

  private extractGptImage2Payload(payload: unknown): {
    imageUrl?: string;
    imageData?: string;
  } {
    if (!payload || typeof payload !== 'object') return {};
    const root = payload as Record<string, unknown>;

    const tryList = (list: unknown): { imageUrl?: string; imageData?: string } | undefined => {
      if (!Array.isArray(list) || list.length === 0) return undefined;
      for (const item of list) {
        const picked = this.pickImageFromUnknown(item);
        if (picked?.imageUrl || picked?.imageData) return picked;
      }
      return undefined;
    };

    const fromDataArr = tryList(root.data);
    if (fromDataArr) return fromDataArr;

    const fromImages = tryList(root.images);
    if (fromImages) return fromImages;

    const fromOutput = tryList(root.output);
    if (fromOutput) return fromOutput;

    if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) {
      const nested = root.data as Record<string, unknown>;
      const fromNested = this.pickImageFromUnknown(nested);
      if (fromNested) return fromNested;
      const fromNestedData = tryList(nested.data);
      if (fromNestedData) return fromNestedData;
      const fromNestedImages = tryList(nested.images);
      if (fromNestedImages) return fromNestedImages;
      const fromNestedResult = this.pickImageFromUnknown(nested.result);
      if (fromNestedResult) return fromNestedResult;
    }

    const fromRoot = this.pickImageFromUnknown(root);
    if (fromRoot) return fromRoot;

    return {};
  }
}
