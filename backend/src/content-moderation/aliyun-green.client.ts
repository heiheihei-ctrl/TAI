import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Green20220302, {
  ImageModerationRequest,
  TextModerationPlusRequest,
  VideoModerationRequest,
  VideoModerationResultRequest,
} from '@alicloud/green20220302';
import { Config } from '@alicloud/openapi-client';
import { ALIYUN_GREEN_DEFAULTS } from './content-moderation.types';

type GreenClient = InstanceType<typeof Green20220302>;

export interface AliyunGreenScanResult {
  ok: boolean;
  riskLevel: string;
  labels: string[];
  requestId?: string;
  code?: number | string;
  message?: string;
  raw?: unknown;
}

@Injectable()
export class AliyunGreenClient {
  private readonly logger = new Logger(AliyunGreenClient.name);
  private client: GreenClient | null = null;
  private initError: string | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const flag = (this.config.get<string>('ALIYUN_GREEN_ENABLED') || '').trim().toLowerCase();
    if (flag === 'false' || flag === '0' || flag === 'off') return false;
    if (flag === 'true' || flag === '1' || flag === 'on') return true;
    // 未显式开关时：有密钥即启用
    return Boolean(this.getAccessKeyId() && this.getAccessKeySecret());
  }

  getBlockMessage(): string {
    return (
      this.config.get<string>('ALIYUN_GREEN_BLOCK_MESSAGE')?.trim() ||
      ALIYUN_GREEN_DEFAULTS.blockMessage
    );
  }

  getBlockRiskLevels(): Set<string> {
    const raw =
      this.config.get<string>('ALIYUN_GREEN_BLOCK_RISK_LEVELS') ||
      ALIYUN_GREEN_DEFAULTS.blockRiskLevels.join(',');
    return new Set(
      raw
        .split(/[,\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  shouldBlockRiskLevel(riskLevel: string | undefined | null): boolean {
    const level = String(riskLevel || 'none').trim().toLowerCase();
    return this.getBlockRiskLevels().has(level);
  }

  async scanText(content: string, dataId?: string): Promise<AliyunGreenScanResult> {
    const trimmed = typeof content === 'string' ? content.trim() : '';
    if (!trimmed) {
      return { ok: true, riskLevel: 'none', labels: [] };
    }

    const client = this.getClient();
    const request = new TextModerationPlusRequest({
      service: this.getTextService(),
      serviceParameters: JSON.stringify({
        content: trimmed.slice(0, 5000),
        ...(dataId ? { dataId: dataId.slice(0, 64) } : {}),
      }),
    });

    const response = await client.textModerationPlus(request);
    const body = response?.body as any;
    const code = Number(body?.code ?? response?.statusCode ?? 0);
    const data = body?.data || {};
    const labels = this.extractLabels(data?.result || data?.Result);
    const riskLevel = String(data?.riskLevel || data?.RiskLevel || 'none').toLowerCase();

    if (code !== 200) {
      this.logger.warn(
        `[AliyunGreen] text scan non-200 code=${code} msg=${body?.message || body?.Message}`,
      );
      return {
        ok: false,
        riskLevel,
        labels,
        requestId: body?.requestId || body?.RequestId,
        code,
        message: body?.message || body?.Message || 'text moderation failed',
        raw: body,
      };
    }

    return {
      ok: true,
      riskLevel,
      labels,
      requestId: body?.requestId || body?.RequestId,
      code,
      message: body?.message || body?.Message,
      raw: body,
    };
  }

  async scanImage(imageUrl: string, dataId?: string): Promise<AliyunGreenScanResult> {
    const url = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (!url || !/^https?:\/\//i.test(url)) {
      return { ok: true, riskLevel: 'none', labels: [] };
    }

    const client = this.getClient();
    const request = new ImageModerationRequest({
      service: this.getImageService(),
      serviceParameters: JSON.stringify({
        imageUrl: url,
        ...(dataId ? { dataId: dataId.slice(0, 64) } : {}),
      }),
    });

    const response = await client.imageModeration(request);
    const body = response?.body as any;
    const code = Number(body?.code ?? response?.statusCode ?? 0);
    const data = body?.data || {};
    const labels = this.extractLabels(data?.result || data?.Result);
    const riskLevel = String(data?.riskLevel || data?.RiskLevel || 'none').toLowerCase();

    if (code !== 200) {
      this.logger.warn(
        `[AliyunGreen] image scan non-200 code=${code} msg=${body?.message || body?.Message}`,
      );
      return {
        ok: false,
        riskLevel,
        labels,
        requestId: body?.requestId || body?.RequestId,
        code,
        message: body?.message || body?.Message || 'image moderation failed',
        raw: body,
      };
    }

    return {
      ok: true,
      riskLevel,
      labels,
      requestId: body?.requestId || body?.RequestId,
      code,
      message: body?.message || body?.Message,
      raw: body,
    };
  }

  /**
   * 视频文件审核：提交 videoDetection 任务并轮询结果。
   */
  async scanVideo(videoUrl: string, dataId?: string): Promise<AliyunGreenScanResult> {
    const url = typeof videoUrl === 'string' ? videoUrl.trim() : '';
    if (!url || !/^https?:\/\//i.test(url)) {
      return { ok: true, riskLevel: 'none', labels: [] };
    }

    const client = this.getClient();
    const service = this.getVideoService();
    const submitReq = new VideoModerationRequest({
      service,
      serviceParameters: JSON.stringify({
        url,
        ...(dataId ? { dataId: dataId.slice(0, 64) } : {}),
      }),
    });

    const submitResp = await client.videoModeration(submitReq);
    const submitBody = submitResp?.body as any;
    const submitCode = Number(submitBody?.code ?? submitResp?.statusCode ?? 0);
    const taskId =
      submitBody?.data?.taskId ||
      submitBody?.data?.TaskId ||
      submitBody?.Data?.taskId ||
      submitBody?.Data?.TaskId;

    if (submitCode !== 200 || !taskId) {
      this.logger.warn(
        `[AliyunGreen] video submit failed code=${submitCode} msg=${submitBody?.message || submitBody?.Message}`,
      );
      return {
        ok: false,
        riskLevel: 'none',
        labels: [],
        requestId: submitBody?.requestId || submitBody?.RequestId,
        code: submitCode,
        message: submitBody?.message || submitBody?.Message || 'video moderation submit failed',
        raw: submitBody,
      };
    }

    const maxAttempts = Number(this.config.get<string>('ALIYUN_GREEN_VIDEO_POLL_ATTEMPTS') || 45);
    const intervalMs = Number(this.config.get<string>('ALIYUN_GREEN_VIDEO_POLL_INTERVAL_MS') || 2000);

    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
      await this.delay(Math.max(500, intervalMs));
      const resultReq = new VideoModerationResultRequest({
        service,
        serviceParameters: JSON.stringify({ taskId }),
      });
      const resultResp = await client.videoModerationResult(resultReq);
      const body = resultResp?.body as any;
      const code = Number(body?.code ?? resultResp?.statusCode ?? 0);
      const message = String(body?.message || body?.Message || '').toLowerCase();
      const data = body?.data || body?.Data || {};

      // 处理中
      if (
        code === 280 ||
        message.includes('processing') ||
        message.includes('running') ||
        String(data?.status || data?.Status || '').toLowerCase() === 'processing'
      ) {
        continue;
      }

      if (code !== 200) {
        this.logger.warn(
          `[AliyunGreen] video result non-200 code=${code} msg=${body?.message || body?.Message}`,
        );
        return {
          ok: false,
          riskLevel: 'none',
          labels: [],
          requestId: body?.requestId || body?.RequestId,
          code,
          message: body?.message || body?.Message || 'video moderation result failed',
          raw: body,
        };
      }

      const riskLevel = String(data?.riskLevel || data?.RiskLevel || 'none').toLowerCase();
      const labels = this.extractLabels(
        data?.frameResult ||
          data?.FrameResult ||
          data?.audioResult ||
          data?.AudioResult ||
          data?.result ||
          data?.Result ||
          data?.sliceResult ||
          data?.SliceResult,
      );

      return {
        ok: true,
        riskLevel,
        labels,
        requestId: body?.requestId || body?.RequestId,
        code,
        message: body?.message || body?.Message,
        raw: body,
      };
    }

    return {
      ok: false,
      riskLevel: 'none',
      labels: [],
      message: 'video moderation polling timeout',
    };
  }

  private getTextService(): string {
    return (
      this.config.get<string>('ALIYUN_GREEN_TEXT_SERVICE')?.trim() ||
      ALIYUN_GREEN_DEFAULTS.textService
    );
  }

  private getImageService(): string {
    return (
      this.config.get<string>('ALIYUN_GREEN_IMAGE_SERVICE')?.trim() ||
      ALIYUN_GREEN_DEFAULTS.imageService
    );
  }

  private getVideoService(): string {
    return (
      this.config.get<string>('ALIYUN_GREEN_VIDEO_SERVICE')?.trim() ||
      ALIYUN_GREEN_DEFAULTS.videoService
    );
  }

  private getAccessKeyId(): string {
    return (
      this.config.get<string>('ALIYUN_GREEN_ACCESS_KEY_ID')?.trim() ||
      this.config.get<string>('ALIBABA_CLOUD_ACCESS_KEY_ID')?.trim() ||
      this.config.get<string>('ALI_ACCESS_KEY_ID')?.trim() ||
      ''
    );
  }

  private getAccessKeySecret(): string {
    return (
      this.config.get<string>('ALIYUN_GREEN_ACCESS_KEY_SECRET')?.trim() ||
      this.config.get<string>('ALIBABA_CLOUD_ACCESS_KEY_SECRET')?.trim() ||
      this.config.get<string>('ALI_ACCESS_KEY_SECRET')?.trim() ||
      ''
    );
  }

  private getClient(): GreenClient {
    if (this.client) return this.client;
    if (this.initError) {
      throw new Error(this.initError);
    }

    const accessKeyId = this.getAccessKeyId();
    const accessKeySecret = this.getAccessKeySecret();
    if (!accessKeyId || !accessKeySecret) {
      this.initError =
        '阿里云内容安全未配置：请设置 ALIYUN_GREEN_ACCESS_KEY_ID / ALIYUN_GREEN_ACCESS_KEY_SECRET';
      throw new Error(this.initError);
    }

    const endpoint =
      this.config.get<string>('ALIYUN_GREEN_ENDPOINT')?.trim() ||
      ALIYUN_GREEN_DEFAULTS.endpoint;
    const regionId =
      this.config.get<string>('ALIYUN_GREEN_REGION')?.trim() ||
      ALIYUN_GREEN_DEFAULTS.regionId;

    const openApiConfig = new Config({
      accessKeyId,
      accessKeySecret,
      endpoint,
      regionId,
    });

    // @alicloud/green20220302 default export
    this.client = new (Green20220302 as any)(openApiConfig);
    const akPreview = `${accessKeyId.slice(0, 4)}***${accessKeyId.slice(-4)}`;
    this.logger.log(
      `[AliyunGreen] client ready endpoint=${endpoint} ak=${akPreview} text=${this.getTextService()} image=${this.getImageService()} video=${this.getVideoService()}`,
    );
    return this.client!;
  }

  private extractLabels(result: unknown): string[] {
    const labels = new Set<string>();
    const walk = (node: unknown, depth = 0) => {
      if (!node || depth > 6) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      if (typeof node !== 'object') return;
      const obj = node as Record<string, any>;
      const label = obj.label || obj.Label || obj.labels || obj.Labels;
      if (typeof label === 'string' && label.trim() && label.toLowerCase() !== 'nonlabel') {
        labels.add(label.trim());
      } else if (Array.isArray(label)) {
        for (const item of label) {
          if (typeof item === 'string' && item.trim()) labels.add(item.trim());
        }
      }
      for (const value of Object.values(obj)) {
        if (value && typeof value === 'object') walk(value, depth + 1);
      }
    };
    walk(result);
    return Array.from(labels).slice(0, 30);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
