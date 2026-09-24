import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { OssService } from './oss.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { Readable } from 'stream';

type MultipartFileLike = {
  toBuffer: () => Promise<Buffer>;
  mimetype?: string;
  filename?: string;
  fields?: Record<string, unknown>;
};

const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/mpeg',
  'video/3gpp',
  'video/x-flv',
];

const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_IMAGE_SIZE = 32 * 1024 * 1024; // 32MB
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 通用文件上限（本地模式）
const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

type MultipartFieldValue = { value?: unknown } | MultipartFileLike | MultipartFileLike[];

function normalizeUploadDir(raw?: string, fallback = 'uploads/images/'): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return fallback;
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function sanitizeFileName(raw?: string, fallback = 'image.png'): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const source = trimmed || fallback;
  return source.replace(/[^a-zA0-9_.-]/g, '_');
}

function inferExtFromMime(mimeType?: string): string {
  const value = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  if (value === 'image/jpeg' || value === 'image/jpg') return 'jpg';
  if (value === 'image/png') return 'png';
  if (value === 'image/webp') return 'webp';
  if (value === 'image/gif') return 'gif';
  if (value === 'image/svg+xml') return 'svg';
  if (value === 'video/mp4') return 'mp4';
  if (value === 'model/gltf-binary') return 'glb';
  return 'bin';
}

function readMultipartField(
  fields: Record<string, MultipartFieldValue> | undefined,
  name: string,
): string | undefined {
  if (!fields) return undefined;
  const raw = fields[name];
  if (!raw || typeof raw !== 'object') return undefined;
  if (Array.isArray(raw)) return undefined;
  if (!('value' in raw)) return undefined;
  const value = (raw as { value?: unknown }).value;
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

async function readMultipartUpload(
  req: FastifyRequest,
  maxBytes: number,
): Promise<{
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  dir?: string;
  key?: string;
  fileName?: string;
}> {
  if (typeof (req as any).file !== 'function') {
    throw new BadRequestException('Multipart is not available on this request');
  }

  let data: MultipartFileLike | undefined;
  try {
    data = await (req as any).file({
      limits: { fileSize: maxBytes },
    });
  } catch (error: any) {
    const code = String(error?.code || '');
    if (code === 'FST_REQ_FILE_TOO_LARGE' || /file.*(too large|limit)/i.test(String(error?.message || ''))) {
      throw new PayloadTooLargeException(`File exceeds limit of ${maxBytes} bytes`);
    }
    throw error;
  }

  if (!data) {
    throw new BadRequestException('No file uploaded');
  }

  const buffer = await data.toBuffer();
  if (!buffer?.length) {
    throw new BadRequestException('Uploaded file is empty');
  }
  if (buffer.length > maxBytes) {
    throw new PayloadTooLargeException(`File exceeds limit of ${maxBytes} bytes`);
  }

  const fields = (data.fields || {}) as Record<string, MultipartFieldValue>;
  return {
    buffer,
    mimeType: String(data.mimetype || 'application/octet-stream').toLowerCase(),
    originalName: String(data.filename || '').trim(),
    dir: readMultipartField(fields, 'dir'),
    key: readMultipartField(fields, 'key'),
    fileName: readMultipartField(fields, 'fileName'),
  };
}

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(private readonly oss: OssService) {}

  @Get('storage-mode')
  storageMode() {
    return this.oss.getStorageInfo();
  }

  @Post('presign')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  async presign(@Body() body: { key: string; contentType?: string }) {
    if (!body || !body.key) {
      throw new BadRequestException('上传路径(key)不能为空');
    }
    const data = await this.oss.getPresignedPutUrl(body.key, body.contentType);
    return data;
  }

  @Post('image')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  async uploadImage(@Req() req: FastifyRequest) {
    const uploaded = await readMultipartUpload(req, MAX_IMAGE_SIZE);

    if (!SUPPORTED_IMAGE_TYPES.includes(uploaded.mimeType)) {
      throw new BadRequestException(`Unsupported image format: ${uploaded.mimeType}`);
    }

    const dir = normalizeUploadDir(uploaded.dir, 'uploads/images/');
    const explicitKey = uploaded.key ? uploaded.key.replace(/^\/+/, '') : '';
    const safeFileName = sanitizeFileName(
      uploaded.fileName || uploaded.originalName || `image.${inferExtFromMime(uploaded.mimeType)}`,
    );
    const key = (() => {
      if (explicitKey) return explicitKey;
      const ext = safeFileName.includes('.')
        ? safeFileName.split('.').pop() || inferExtFromMime(uploaded.mimeType)
        : inferExtFromMime(uploaded.mimeType);
      return `${dir}${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeFileName.replace(/\.[^.]+$/, '')}.${ext}`;
    })();

    const result = await this.oss.putStream(key, Readable.from(uploaded.buffer), {
      headers: {
        'Content-Type': uploaded.mimeType || 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

    return { url: result.url, key: result.key, mode: this.oss.getUploadMode() };
  }

  /**
   * 通用文件上传（本地模式主路径；也可用于视频/3D 等经后端中转）
   */
  @Post('file')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  async uploadFile(@Req() req: FastifyRequest) {
    const uploaded = await readMultipartUpload(req, MAX_FILE_SIZE);
    const mimeType = uploaded.mimeType || 'application/octet-stream';
    const dir = normalizeUploadDir(uploaded.dir, 'uploads/');
    const explicitKey = uploaded.key ? uploaded.key.replace(/^\/+/, '') : '';
    const safeFileName = sanitizeFileName(
      uploaded.fileName || uploaded.originalName || `file.${inferExtFromMime(mimeType)}`,
    );
    const key = (() => {
      if (explicitKey) return explicitKey;
      const ext = safeFileName.includes('.')
        ? safeFileName.split('.').pop() || inferExtFromMime(mimeType)
        : inferExtFromMime(mimeType);
      return `${dir}${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeFileName.replace(/\.[^.]+$/, '')}.${ext}`;
    })();

    this.logger.log(
      `[upload/file] mode=${this.oss.getUploadMode()} key=${key} size=${uploaded.buffer.length}`,
    );

    const result = await this.oss.putStream(key, Readable.from(uploaded.buffer), {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

    return { url: result.url, key: result.key, mode: this.oss.getUploadMode() };
  }

  @Post('video')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  async uploadVideo(@Req() req: FastifyRequest) {
    const uploaded = await readMultipartUpload(req, MAX_VIDEO_SIZE);

    if (!SUPPORTED_VIDEO_TYPES.includes(uploaded.mimeType)) {
      throw new BadRequestException(
        `Unsupported video format: ${uploaded.mimeType}. Supported: ${SUPPORTED_VIDEO_TYPES.join(', ')}`,
      );
    }

    const ext = uploaded.originalName.split('.').pop() || 'mp4';
    const key = `videos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const result = await this.oss.putStream(key, Readable.from(uploaded.buffer), {
      headers: { 'Content-Type': uploaded.mimeType },
    });

    return { url: result.url, key: result.key, mode: this.oss.getUploadMode() };
  }

  @Post('transfer-video')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard)
  async transferVideo(@Body() body: { videoUrl: string }) {
    const { videoUrl } = body;
    if (!videoUrl || typeof videoUrl !== 'string') {
      throw new BadRequestException('videoUrl is required');
    }

    let url: URL;
    try {
      url = new URL(videoUrl.trim());
    } catch {
      throw new BadRequestException('Invalid video URL');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException('Only HTTP/HTTPS URLs are supported');
    }

    this.logger.log(`[transfer-video] Downloading from: ${videoUrl.slice(0, 100)}...`);

    const response = await fetch(videoUrl, {
      headers: { 'User-Agent': 'Tanva-Server/1.0' },
    });

    if (!response.ok) {
      throw new BadRequestException(`Failed to download video: HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');

    if (contentLength && parseInt(contentLength, 10) > MAX_VIDEO_SIZE) {
      throw new BadRequestException(
        `Video too large: ${contentLength} bytes (max ${MAX_VIDEO_SIZE})`,
      );
    }

    let ext = 'mp4';
    if (contentType.includes('webm')) ext = 'webm';
    else if (contentType.includes('quicktime') || contentType.includes('mov')) ext = 'mov';
    else if (contentType.includes('avi')) ext = 'avi';

    const key = `videos/transferred/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    this.logger.log(`[transfer-video] Downloaded ${buffer.length} bytes, uploading as ${key}`);

    const result = await this.oss.putStream(key, Readable.from(buffer), {
      headers: { 'Content-Type': contentType },
    });

    this.logger.log(`[transfer-video] Upload complete: ${result.url}`);

    return { url: result.url, key: result.key, mode: this.oss.getUploadMode() };
  }
}
