import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Readable } from 'stream';
import { OssService } from '../../oss/oss.service';

const MANAGED_IMAGE_KEY_REGEX = /^(projects|uploads|templates|videos|ai)\//i;
const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;
const IMAGE_FETCH_TIMEOUT_MS = 30_000;

export interface ResolveUpstreamImageUrlOptions {
  /** OSS key prefix, e.g. ai/images/banana-inputs */
  uploadPrefix?: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const timeout = init.timeout ?? IMAGE_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class UpstreamImageUrlService {
  private readonly logger = new Logger(UpstreamImageUrlService.name);

  constructor(private readonly oss: OssService) {}

  async resolveHttpUrls(
    inputs: string[],
    options?: ResolveUpstreamImageUrlOptions,
  ): Promise<string[]> {
    const results: string[] = [];
    for (const input of inputs) {
      const url = await this.resolveHttpUrl(input, options);
      if (url) results.push(url);
    }
    return results;
  }

  /**
   * Convert base64 / data URL / managed key / remote URL into a public HTTPS URL
   * suitable for ToAPIs upstream (base64 inline images are rejected).
   */
  async resolveHttpUrl(
    input: string,
    options?: ResolveUpstreamImageUrlOptions,
  ): Promise<string> {
    let trimmed = typeof input === 'string' ? input.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('图片输入为空，无法提交到 ToAPIs');
    }

    if (trimmed.startsWith('blob:')) {
      throw new BadRequestException(
        'blob: 图片无法在后端解析，请先上传到 OSS 或使用远程 URL 后再提交',
      );
    }

    const malformedDataUrlMatch = trimmed.match(
      /^data:image\/[\w.+-]+;base64,(https?:\/\/.+)$/i,
    );
    if (malformedDataUrlMatch?.[1]) {
      trimmed = malformedDataUrlMatch[1];
    }

    const managedKeyOnly = this.extractManagedImageKey(trimmed);
    if (managedKeyOnly && !/^https?:\/\//i.test(trimmed)) {
      return this.normalizeManagedAssetUrl(trimmed);
    }

    if (/^https?:\/\//i.test(trimmed)) {
      if (this.isDataUrl(trimmed)) {
        return this.uploadDataOrBase64(trimmed, options);
      }
      return this.normalizeManagedAssetUrl(trimmed);
    }

    if (this.isDataUrl(trimmed) || this.looksLikeRawBase64(trimmed)) {
      return this.uploadDataOrBase64(trimmed, options);
    }

    const keyFromInput = this.extractManagedImageKey(trimmed);
    if (keyFromInput) {
      return this.normalizeManagedAssetUrl(keyFromInput);
    }

    throw new BadRequestException(
      '不支持的图片格式，请使用远程 URL、OSS 资源或标准 base64/data URL',
    );
  }

  private isDataUrl(value: string): boolean {
    return /^data:(?:image\/[\w.+-]+|application\/pdf);base64,/i.test(value);
  }

  private looksLikeRawBase64(value: string): boolean {
    const sanitized = value.replace(/\s+/g, '');
    return sanitized.length > 64 && BASE64_REGEX.test(sanitized);
  }

  private extractManagedImageKey(input: string): string | null {
    const trimmed = typeof input === 'string' ? input.trim() : '';
    if (!trimmed) return null;

    const normalizeKey = (raw?: string | null): string | null => {
      const value = typeof raw === 'string' ? raw.trim().replace(/^\/+/, '') : '';
      if (!value) return null;
      return MANAGED_IMAGE_KEY_REGEX.test(value) ? value : null;
    };

    const normalizedDirect = normalizeKey(trimmed);
    if (normalizedDirect) return normalizedDirect;

    try {
      const parsed = new URL(trimmed);
      const keyFromPath = normalizeKey(parsed.pathname);
      if (keyFromPath) return keyFromPath;

      const keyFromQuery = normalizeKey(parsed.searchParams.get('key'));
      if (keyFromQuery) return keyFromQuery;

      const nestedUrl = parsed.searchParams.get('url');
      if (nestedUrl && nestedUrl !== trimmed) {
        return this.extractManagedImageKey(nestedUrl);
      }
    } catch {
      // ignore
    }

    return null;
  }

  private resolveOssHosts(): string[] {
    return this.oss.publicHosts();
  }

  private isOssPublicUrl(url: string): boolean {
    try {
      const host = new URL(url).hostname;
      return this.resolveOssHosts().some(
        (ossHost) => host === ossHost || host.endsWith(`.${ossHost}`),
      );
    } catch {
      return false;
    }
  }

  private buildBucketOriginUrlForKey(key: string): string | null {
    const normalizedKey = typeof key === 'string' ? key.trim().replace(/^\/+/, '') : '';
    if (!normalizedKey) return null;
    const [bucketOriginHost] = this.resolveOssHosts();
    if (!bucketOriginHost) return null;
    return `https://${bucketOriginHost}/${normalizedKey}`;
  }

  private normalizeManagedAssetUrl(input: string): string {
    const trimmed = typeof input === 'string' ? input.trim() : '';
    if (!trimmed) return '';
    const managedKey = this.extractManagedImageKey(trimmed);
    if (!managedKey) {
      if (trimmed.startsWith('data:')) {
        throw new BadRequestException('ToAPIs 不接受 base64 内联图片，请先上传到 OSS');
      }
      return trimmed;
    }
    return this.buildBucketOriginUrlForKey(managedKey) || this.oss.publicUrl(managedKey);
  }

  private parseDataOrBase64(input: string): { buffer: Buffer; mimeType: string } {
    const trimmed = input.trim();
    const dataMatch = trimmed.match(
      /^data:((?:image\/[\w.+-]+)|(?:application\/pdf));base64,(.+)$/i,
    );
    if (dataMatch) {
      const mimeType = dataMatch[1] || 'image/png';
      const payload = dataMatch[2].replace(/\s+/g, '');
      const buffer = Buffer.from(payload, 'base64');
      if (!buffer.length) {
        throw new BadRequestException('图片 base64 解码失败（空内容）');
      }
      return { buffer, mimeType };
    }

    const sanitized = trimmed.replace(/\s+/g, '');
    if (!BASE64_REGEX.test(sanitized)) {
      throw new BadRequestException('图片 base64 格式无效');
    }
    const buffer = Buffer.from(sanitized, 'base64');
    if (!buffer.length) {
      throw new BadRequestException('图片 base64 解码失败（空内容）');
    }
    return { buffer, mimeType: this.inferMimeTypeFromBuffer(buffer) };
  }

  private inferMimeTypeFromBuffer(buffer: Buffer): string {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'image/png';
    }
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }
    if (buffer.length >= 6 && buffer.toString('ascii', 0, 6) === 'GIF89a') {
      return 'image/gif';
    }
    return 'image/png';
  }

  private extensionFromMime(mimeType: string): string {
    const raw = mimeType.split('/')[1]?.split(';')[0]?.trim().toLowerCase() || 'png';
    if (raw === 'jpeg') return 'jpg';
    if (raw === 'pdf') return 'pdf';
    if (/^[a-z0-9]+$/.test(raw)) return raw;
    return 'png';
  }

  private ensureOssEnabled(): void {
    if (!this.oss.isEnabled()) {
      throw new ServiceUnavailableException(
        'OSS 未配置或已禁用，无法将图片转为远程 URL 后提交 ToAPIs（请配置 OSS_* 或 OSS_ENABLED=true）',
      );
    }
  }

  private async uploadDataOrBase64(
    input: string,
    options?: ResolveUpstreamImageUrlOptions,
  ): Promise<string> {
    this.ensureOssEnabled();
    const { buffer, mimeType } = this.parseDataOrBase64(input);
    const prefix = (options?.uploadPrefix || 'ai/images/upstream-inputs').replace(/\/+$/, '');
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const extension = this.extensionFromMime(mimeType);
    const key = `${prefix}/${timestamp}-${randomId}.${extension}`;

    const { url } = await this.oss.putStream(key, Readable.from(buffer), {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

    if (!url) {
      throw new ServiceUnavailableException('图片上传到 OSS 失败，未获得公开 URL');
    }

    this.logger.log(
      `[UpstreamImageUrl] uploaded ${Math.round(buffer.length / 1024)}KB -> ${url.substring(0, 120)}`,
    );
    return this.normalizeManagedAssetUrl(url);
  }

  private buildImageFetchCandidates(imageUrl: string): string[] {
    const trimmed = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (!trimmed) return [];

    const candidates: string[] = [];
    const pushCandidate = (candidate?: string | null) => {
      const value = typeof candidate === 'string' ? candidate.trim() : '';
      if (!value) return;
      if (!/^https?:\/\//i.test(value)) return;
      if (!candidates.includes(value)) candidates.push(value);
    };

    pushCandidate(trimmed);

    const managedKey = this.extractManagedImageKey(trimmed);
    if (managedKey) {
      pushCandidate(this.buildBucketOriginUrlForKey(managedKey));
      pushCandidate(this.oss.publicUrl(managedKey));
    }

    try {
      const parsed = new URL(trimmed);
      const nestedUrl = parsed.searchParams.get('url');
      if (nestedUrl) {
        pushCandidate(nestedUrl);
        const nestedKey = this.extractManagedImageKey(nestedUrl);
        if (nestedKey) {
          pushCandidate(this.buildBucketOriginUrlForKey(nestedKey));
          pushCandidate(this.oss.publicUrl(nestedKey));
        }
      }
    } catch {
      // ignore
    }

    return candidates;
  }

  /** Mirror a remote non-OSS image to OSS when upstream may not fetch the source URL. */
  async mirrorRemoteImageIfNeeded(
    input: string,
    options?: ResolveUpstreamImageUrlOptions,
  ): Promise<string> {
    const trimmed = typeof input === 'string' ? input.trim() : '';
    if (!trimmed || this.isDataUrl(trimmed) || this.looksLikeRawBase64(trimmed)) {
      return this.resolveHttpUrl(input, options);
    }

    if (!/^https?:\/\//i.test(trimmed)) {
      return this.resolveHttpUrl(input, options);
    }

    if (this.isOssPublicUrl(trimmed)) {
      return this.normalizeManagedAssetUrl(trimmed);
    }

    this.ensureOssEnabled();
    const fetchCandidates = this.buildImageFetchCandidates(trimmed);
    if (!fetchCandidates.length) {
      throw new BadRequestException(`无法下载远程图片: ${trimmed.substring(0, 120)}`);
    }

    let imageBuffer: Buffer | null = null;
    let contentType = 'image/jpeg';
    const errors: string[] = [];

    for (const candidate of fetchCandidates) {
      try {
        const response = await fetchWithTimeout(candidate, { method: 'GET' });
        if (!response.ok) {
          errors.push(`${candidate} -> HTTP ${response.status}`);
          continue;
        }
        const nextContentType = response.headers.get('content-type') || 'image/jpeg';
        if (!nextContentType.toLowerCase().startsWith('image/')) {
          errors.push(`${candidate} -> invalid content-type ${nextContentType}`);
          continue;
        }
        imageBuffer = Buffer.from(await response.arrayBuffer());
        if (!imageBuffer.length) {
          errors.push(`${candidate} -> empty body`);
          continue;
        }
        contentType = nextContentType;
        break;
      } catch (error) {
        errors.push(
          `${candidate} -> ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (!imageBuffer) {
      throw new BadRequestException(
        `远程图片下载失败: ${errors.slice(0, 3).join(' | ')}`,
      );
    }

    const prefix = (options?.uploadPrefix || 'ai/images/upstream-inputs').replace(/\/+$/, '');
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const extension = this.extensionFromMime(contentType);
    const key = `${prefix}/${timestamp}-${randomId}.${extension}`;
    const { url } = await this.oss.putStream(key, Readable.from(imageBuffer), {
      headers: {
        'Content-Type': contentType.split(';')[0].trim(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

    if (!url) {
      throw new ServiceUnavailableException('远程图片镜像到 OSS 失败');
    }

    return this.normalizeManagedAssetUrl(url);
  }
}
