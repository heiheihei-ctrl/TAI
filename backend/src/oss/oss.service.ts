import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { getDeploymentBrand } from '../config/deployment-brand';

export type UploadStorageMode = 'tos' | 'local';

@Injectable()
export class OssService {
  constructor(private readonly config: ConfigService) {}

  private cachedClient: S3Client | null = null;
  private ossEnabledChecked = false;
  private ossEnabled = false;
  private loggedDisabled = false;
  private loggedLocalMode = false;

  private get conf() {
    return {
      region: this.config.get<string>('OSS_REGION') || 'cn-guangzhou',
      bucket: this.config.get<string>('OSS_BUCKET') || 'your-bucket',
      accessKeyId: this.config.get<string>('OSS_ACCESS_KEY_ID') || 'test-id',
      accessKeySecret: this.config.get<string>('OSS_ACCESS_KEY_SECRET') || 'test-secret',
      cdnHost: this.config.get<string>('OSS_CDN_HOST') || '',
      // 如果没有配置 Endpoint，默认给一个火山引擎广州的节点作为占位
      endpoint: this.config.get<string>('OSS_ENDPOINT') || 'https://tos-cn-guangzhou.volces.com',
    };
  }

  /**
   * `tos` = 火山 TOS/S3；`local` = 写本地磁盘（配合 nginx 静态目录）
   * - 显式 `UPLOAD_MODE` / `OSS_UPLOAD_MODE` 优先
   * - 未配置时：`DEPLOYMENT_BRAND=linglong` 默认 local（不上云 COS/TOS）
   */
  getUploadMode(): UploadStorageMode {
    const raw = String(
      this.config.get<string>('UPLOAD_MODE') ||
        this.config.get<string>('OSS_UPLOAD_MODE') ||
        '',
    )
      .trim()
      .toLowerCase();
    if (raw === 'local' || raw === 'disk' || raw === 'nginx') return 'local';
    if (raw === 'tos' || raw === 'oss' || raw === 's3' || raw === 'cos') return 'tos';
    // linglong 部署默认本地落盘，避免走公有云对象存储
    if (getDeploymentBrand() === 'linglong') return 'local';
    return 'tos';
  }

  isLocalMode(): boolean {
    return this.getUploadMode() === 'local';
  }

  /**
   * 本地落盘根目录。典型：nginx html 目录，例如 `/usr/share/nginx/html`
   * 对象 key（如 `uploads/a.png`）会写成 `{root}/uploads/a.png`
   */
  getLocalRoot(): string {
    const raw =
      this.config.get<string>('LOCAL_UPLOAD_ROOT') ||
      this.config.get<string>('UPLOAD_LOCAL_ROOT') ||
      '';
    const trimmed = String(raw || '').trim();
    if (trimmed) return resolve(trimmed);
    // 开发默认：backend/local-uploads
    return resolve(process.cwd(), 'local-uploads');
  }

  /** 拼公开访问 URL 的 base（无尾斜杠），需与 nginx 对外域名一致 */
  getLocalPublicBaseUrl(): string {
    const raw =
      this.config.get<string>('LOCAL_UPLOAD_PUBLIC_BASE_URL') ||
      this.config.get<string>('UPLOAD_PUBLIC_BASE_URL') ||
      this.config.get<string>('OSS_CDN_HOST') ||
      '';
    const trimmed = String(raw || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed.replace(/^\/+/, '')}`;
  }

  private normalizeObjectKey(key: string): string {
    return String(key || '')
      .trim()
      .replace(/^\/+/, '')
      .replace(/\\/g, '/');
  }

  /** 将 object key 映射到本地绝对路径，并防止路径穿越 */
  resolveLocalPath(key: string): string {
    const normalizedKey = this.normalizeObjectKey(key);
    if (!normalizedKey) {
      throw new Error('Empty object key');
    }
    if (normalizedKey.includes('..')) {
      throw new Error('Invalid object key');
    }
    const root = this.getLocalRoot();
    const full = resolve(root, ...normalizedKey.split('/').filter(Boolean));
    const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
    if (full !== root && !full.startsWith(rootWithSep)) {
      throw new Error('Invalid object key path');
    }
    return full;
  }

  private async ensureLocalParentDir(filePath: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
  }

  private logLocalModeOnce() {
    if (this.loggedLocalMode) return;
    this.loggedLocalMode = true;
    // eslint-disable-next-line no-console
    console.log(
      `[OSS] UPLOAD_MODE=local root=${this.getLocalRoot()} publicBase=${this.getLocalPublicBaseUrl() || '(relative /key)'}`,
    );
  }

  private isOssEnabled(): boolean {
    if (this.isLocalMode()) {
      this.ossEnabled = true;
      this.ossEnabledChecked = true;
      this.logLocalModeOnce();
      return true;
    }
    if (this.ossEnabledChecked) return this.ossEnabled;

    const disable =
      (this.config.get<string>('OSS_DISABLE') ?? 'false') === 'true' ||
      (this.config.get<string>('DISABLE_OSS') ?? 'false') === 'true';
    if (disable) {
      this.ossEnabled = false;
      this.ossEnabledChecked = true;
      return this.ossEnabled;
    }

    const enabledOverride = (this.config.get<string>('OSS_ENABLED') ?? 'false') === 'true';
    if (enabledOverride) {
      this.ossEnabled = true;
      this.ossEnabledChecked = true;
      return this.ossEnabled;
    }

    const { bucket, accessKeyId, accessKeySecret } = this.conf;
    this.ossEnabled =
      Boolean(bucket && accessKeyId && accessKeySecret) &&
      bucket !== 'your-bucket' &&
      accessKeyId !== 'test-id' &&
      accessKeySecret !== 'test-secret';

    this.ossEnabledChecked = true;
    return this.ossEnabled;
  }

  isEnabled(): boolean {
    return this.isOssEnabled();
  }

  getStorageInfo() {
    return {
      mode: this.getUploadMode(),
      enabled: this.isEnabled(),
      localRoot: this.isLocalMode() ? this.getLocalRoot() : null,
      publicBaseUrl: this.isLocalMode()
        ? this.getLocalPublicBaseUrl() || null
        : this.conf.cdnHost || null,
    };
  }

  private logDisabledOnce() {
    if (this.loggedDisabled) return;
    this.loggedDisabled = true;
    // eslint-disable-next-line no-console
    console.warn('[OSS] OSS 未配置或已禁用，将跳过 OSS 读写（仅使用数据库内容）。');
  }

  private timeoutMs(): number {
    const raw = this.config.get<string>('OSS_TIMEOUT_MS');
    const n = raw ? Number(raw) : 300000;
    if (!Number.isFinite(n)) return 300000;
    return Math.max(1000, Math.min(600000, Math.floor(n)));
  }

  private normalizeEndpoint(endpoint: string): string {
    const trimmed = String(endpoint || '').trim();
    if (!trimmed) return 'https://tos-cn-guangzhou.volces.com';
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  }

  private resolveClientEndpoint(endpoint: string): {
    endpoint: string;
    isVolcengineTos: boolean;
  } {
    const normalized = this.normalizeEndpoint(endpoint);
    try {
      const parsed = new URL(normalized);
      const hostname = parsed.hostname.toLowerCase();
      const isVolcengineTos =
        hostname.endsWith('.volces.com') || hostname.endsWith('.ivolces.com');

      if (
        isVolcengineTos &&
        hostname.startsWith('tos-') &&
        !hostname.startsWith('tos-s3-')
      ) {
        parsed.hostname = hostname.replace(/^tos-/, 'tos-s3-');
      }

      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';

      return {
        endpoint: parsed.toString().replace(/\/+$/, ''),
        isVolcengineTos,
      };
    } catch {
      return { endpoint: normalized, isVolcengineTos: false };
    }
  }

  private client(): S3Client {
    if (this.cachedClient) return this.cachedClient;
    const { region, accessKeyId, accessKeySecret, endpoint } = this.conf;
    const resolvedEndpoint = this.resolveClientEndpoint(endpoint);

    this.cachedClient = new S3Client({
      region,
      endpoint: resolvedEndpoint.endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey: accessKeySecret,
      },
      // Volcengine TOS browser presign works better with bucket-host style.
      forcePathStyle: resolvedEndpoint.isVolcengineTos ? false : true,
      requestHandler: {
        requestTimeout: this.timeoutMs(),
      } as any,
    });
    return this.cachedClient;
  }

  private async putLocalFromStream(
    key: string,
    stream: NodeJS.ReadableStream | Readable,
  ): Promise<{ key: string; url: string }> {
    const normalizedKey = this.normalizeObjectKey(key);
    const filePath = this.resolveLocalPath(normalizedKey);
    await this.ensureLocalParentDir(filePath);
    await pipeline(stream as Readable, createWriteStream(filePath));
    return { key: normalizedKey, url: this.publicUrl(normalizedKey) };
  }

  private async putLocalFromBuffer(
    key: string,
    buffer: Buffer,
  ): Promise<{ key: string; url: string }> {
    const normalizedKey = this.normalizeObjectKey(key);
    const filePath = this.resolveLocalPath(normalizedKey);
    await this.ensureLocalParentDir(filePath);
    await writeFile(filePath, buffer);
    return { key: normalizedKey, url: this.publicUrl(normalizedKey) };
  }

  async openLocalReadStream(key: string): Promise<{
    stream: Readable;
    contentType?: string;
  } | null> {
    const explicitRoot = String(
      this.config.get<string>('LOCAL_UPLOAD_ROOT') ||
        this.config.get<string>('UPLOAD_LOCAL_ROOT') ||
        '',
    ).trim();
    // tos 模式且未配置本地根目录时，不探测磁盘
    if (!this.isLocalMode() && !explicitRoot) return null;

    const normalizedKey = this.normalizeObjectKey(key);
    if (!normalizedKey) return null;
    try {
      const filePath = this.resolveLocalPath(normalizedKey);
      await access(filePath);
      const stream = createReadStream(filePath);
      const ext = normalizedKey.split('.').pop()?.toLowerCase();
      const contentType =
        ext === 'png'
          ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'webp'
              ? 'image/webp'
              : ext === 'gif'
                ? 'image/gif'
                : ext === 'mp4'
                  ? 'video/mp4'
                  : ext === 'json'
                    ? 'application/json'
                    : 'application/octet-stream';
      return { stream, contentType };
    } catch {
      return null;
    }
  }

  /**
   * 生成供前端 PUT 直传的预签名 URL（替代旧的 presignPost 表单策略）
   * local 模式返回 mode=local，由前端改走后端 multipart。
   */
  async getPresignedPutUrl(key: string, contentType = 'application/octet-stream', expiresInSeconds = 300) {
    const normalizedKey = this.normalizeObjectKey(key);
    if (this.isLocalMode()) {
      return {
        mode: 'local' as const,
        uploadUrl: '',
        publicUrl: this.publicUrl(normalizedKey),
        key: normalizedKey,
        contentType,
      };
    }

    const client = this.client();
    const command = new PutObjectCommand({
      Bucket: this.conf.bucket,
      Key: normalizedKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: Math.max(30, Math.min(3600, Math.floor(expiresInSeconds))),
    });

    return {
      mode: 'tos' as const,
      uploadUrl,
      publicUrl: this.publicUrl(normalizedKey),
      key: normalizedKey,
      contentType,
    };
  }

  async putStream(
    key: string,
    stream: NodeJS.ReadableStream | Readable,
    options?: any,
  ): Promise<{ key: string; url: string }> {
    if (!this.isOssEnabled()) {
      this.logDisabledOnce();
      return { key, url: '' };
    }

    if (this.isLocalMode()) {
      return this.putLocalFromStream(key, stream);
    }

    const client = this.client();
    const upload = new Upload({
      client,
      params: {
        Bucket: this.conf.bucket,
        Key: key,
        Body: stream as any,
        ContentType: options?.headers?.['Content-Type'],
        CacheControl: options?.headers?.['Cache-Control'],
      },
    });

    await upload.done();
    return { key, url: this.publicUrl(key) };
  }

  async putBuffer(
    key: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<{ key: string; url: string }> {
    if (!this.isOssEnabled()) {
      this.logDisabledOnce();
      return { key, url: '' };
    }
    if (this.isLocalMode()) {
      return this.putLocalFromBuffer(key, buffer);
    }
    const client = this.client();

    const command = new PutObjectCommand({
      Bucket: this.conf.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await client.send(command);
    return { key, url: this.publicUrl(key) };
  }

  async putJSON(
    key: string,
    data: unknown,
    options?: { acl?: 'private' | 'public-read' | 'public-read-write' },
  ) {
    if (!this.isOssEnabled()) {
      this.logDisabledOnce();
      return key;
    }
    try {
      if (this.isLocalMode()) {
        await this.putLocalFromBuffer(key, Buffer.from(JSON.stringify(data)));
        return key;
      }
      const client = this.client();
      const body = Buffer.from(JSON.stringify(data));

      const commandOptions: any = {
        Bucket: this.conf.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json',
      };

      if (options?.acl) {
        commandOptions.ACL = options.acl;
      }

      const command = new PutObjectCommand(commandOptions);
      await client.send(command);
      console.log(`OSS putJSON success: ${key}`);
      return key;
    } catch (error: any) {
      console.warn(`OSS putJSON failed: ${error.message || error}`);
      return key;
    }
  }

  async getJSON<T = unknown>(key: string): Promise<T | null> {
    console.log('[OssService] getJSON called with key:', key);
    if (!this.isOssEnabled()) {
      this.logDisabledOnce();
      console.log('[OssService] OSS is disabled, returning null');
      return null;
    }
    try {
      if (this.isLocalMode()) {
        const filePath = this.resolveLocalPath(key);
        const content = await readFile(filePath, 'utf8');
        return JSON.parse(content) as T;
      }
      const client = this.client();
      console.log('[OssService] Fetching from OSS...');

      const command = new GetObjectCommand({
        Bucket: this.conf.bucket,
        Key: key,
      });

      const res = await client.send(command);
      const content = await res.Body?.transformToString();

      console.log('[OssService] Got content, length:', content?.length || 0);
      if (!content) return null;
      return JSON.parse(content) as T;
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.Code === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        console.log('[OssService] Key not found:', key);
        return null;
      }
      if (err?.code === 'ENOENT') {
        console.log('[OssService] Local key not found:', key);
        return null;
      }
      console.warn(`OSS getJSON failed: ${err.message || err}`);
      return null;
    }
  }

  async signUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const normalizedKey = typeof key === 'string' ? key.trim().replace(/^\/+/, '') : '';
    if (!normalizedKey) return '';
    if (this.isLocalMode() || !this.isOssEnabled()) {
      return this.publicUrl(normalizedKey);
    }
    try {
      const client = this.client();
      const command = new GetObjectCommand({
        Bucket: this.conf.bucket,
        Key: normalizedKey,
      });
      const signedUrl = await getSignedUrl(client, command, {
        expiresIn: Math.max(30, Math.min(3600, Math.floor(expiresInSeconds))),
      });
      return signedUrl || this.publicUrl(normalizedKey);
    } catch {
      return this.publicUrl(normalizedKey);
    }
  }

  async objectExists(key: string): Promise<boolean> {
    const normalizedKey = typeof key === 'string' ? key.trim().replace(/^\/+/, '') : '';
    if (!normalizedKey) return false;
    if (this.isLocalMode()) {
      try {
        const filePath = this.resolveLocalPath(normalizedKey);
        return existsSync(filePath);
      } catch {
        return false;
      }
    }
    if (!this.isOssEnabled()) return true;
    try {
      const client = this.client();
      const command = new HeadObjectCommand({
        Bucket: this.conf.bucket,
        Key: normalizedKey,
      });
      await client.send(command);
      return true;
    } catch (err: any) {
      const statusCode = err?.$metadata?.httpStatusCode;
      const code = String(err?.name || err?.Code || '');
      if (statusCode === 404 || statusCode === 403 || code === 'NotFound' || code === 'NoSuchKey') {
        return false;
      }
      throw err;
    }
  }

  async objectExistsWithRetry(
    key: string,
    options?: { attempts?: number; delayMs?: number },
  ): Promise<boolean> {
    const attempts = Math.max(1, options?.attempts ?? 4);
    const delayMs = Math.max(0, options?.delayMs ?? 400);
    for (let index = 0; index < attempts; index += 1) {
      if (await this.objectExists(key)) return true;
      if (index < attempts - 1 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (index + 1)));
      }
    }
    return false;
  }

  publicUrl(key: string): string {
    const normalizedKey = this.normalizeObjectKey(key);
    if (this.isLocalMode()) {
      const base = this.getLocalPublicBaseUrl();
      if (base) return `${base}/${normalizedKey}`;
      // 未配置公网 base 时，默认拼本机 API，配合 main.ts 的本地静态挂载
      const port = String(this.config.get<string>('PORT') || process.env.PORT || '4000').trim();
      return `http://localhost:${port || '4000'}/${normalizedKey}`;
    }

    const { cdnHost, bucket, endpoint } = this.conf;

    const rawEndpoint = (endpoint || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');

    const defaultHost = rawEndpoint ? `${bucket}.${rawEndpoint}` : `${bucket}.oss-cn-hangzhou.aliyuncs.com`;
    const host = cdnHost || defaultHost;

    return `https://${host}/${normalizedKey}`;
  }

  publicHosts(): string[] {
    const { cdnHost, bucket, endpoint } = this.conf;
    const stripProtocol = (value: string) => value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

    const rawEndpoint = (endpoint || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const defaultHost = rawEndpoint ? `${bucket}.${rawEndpoint}` : `${bucket}.oss-cn-hangzhou.aliyuncs.com`;

    const hosts = [defaultHost];
    if (cdnHost) {
      hosts.push(stripProtocol(cdnHost));
    }
    const localBase = this.getLocalPublicBaseUrl();
    if (localBase) {
      try {
        hosts.push(new URL(localBase).hostname);
      } catch {
        hosts.push(stripProtocol(localBase));
      }
    }
    return Array.from(new Set(hosts)).filter(Boolean);
  }

  allowedPublicHosts(): string[] {
    const { cdnHost, bucket, endpoint } = this.conf;
    const stripProtocol = (value: string) => value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

    const rawEndpoint = (endpoint || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const defaultHost = rawEndpoint ? `${bucket}.${rawEndpoint}` : `${bucket}.oss-cn-hangzhou.aliyuncs.com`;

    const hosts = [defaultHost];

    if (cdnHost) {
      hosts.push(stripProtocol(cdnHost));
    }

    const localBase = this.getLocalPublicBaseUrl();
    if (localBase) {
      try {
        hosts.push(new URL(localBase).hostname);
      } catch {
        hosts.push(stripProtocol(localBase));
      }
    }

    const extraHosts = this.config.get<string>('ALLOWED_PROXY_HOSTS');
    if (extraHosts) {
      extraHosts.split(',').forEach((h) => {
        const trimmed = h.trim();
        if (trimmed) hosts.push(stripProtocol(trimmed));
      });
    }

    const defaultAllowed = [
      'aliyuncs.com',
      'amazonaws.com.cn',
      'amazonaws.com',
      's3.cn-northwest-1.amazonaws.com.cn',
      'toapis.com',
      'toapis.xyz',
      'files.toapis.com',
      'apimart.ai',
      'kechuangai.com',
      'models.kapon.cloud',
      'volces.com',
      'tencentcos.cn',
      'myqcloud.com',
      'qcloud.com',
      'vod-qcloud.com',
      'tgtai.com',
      'getapib.org',
    ];

    defaultAllowed.forEach((h) => hosts.push(h));

    return Array.from(new Set(hosts)).filter(Boolean);
  }
}
