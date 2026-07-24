import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AliyunGreenClient } from './aliyun-green.client';
import type {
  ContentModerationDecision,
  ContentModerationSource,
} from './content-moderation.types';

@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);

  constructor(private readonly green: AliyunGreenClient) {}

  isEnabled(): boolean {
    return this.green.isEnabled();
  }

  collectTextsFromParams(params?: Record<string, unknown> | null): string[] {
    if (!params || typeof params !== 'object') return [];
    const texts: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) texts.push(value.trim());
      else if (Array.isArray(value)) for (const item of value) push(item);
    };
    const keys = [
      'prompt',
      'requestPrompt',
      'text',
      'message',
      'content',
      'query',
      'input',
      'context',
      'negativePrompt',
      'negative_prompt',
      'systemPrompt',
      'referencePrompt',
      'caption',
      'title',
      'description',
      'reasoning',
    ];
    for (const key of keys) {
      if (key in params) push(params[key]);
    }
    if (params.input && typeof params.input === 'object') {
      texts.push(
        ...this.collectTextsFromParams(params.input as Record<string, unknown>),
      );
    }
    if (params.parameters && typeof params.parameters === 'object') {
      texts.push(
        ...this.collectTextsFromParams(
          params.parameters as Record<string, unknown>,
        ),
      );
    }
    return Array.from(new Set(texts));
  }

  collectImageUrlsFromParams(params?: Record<string, unknown> | null): string[] {
    if (!params || typeof params !== 'object') return [];
    const urls: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^https?:\/\//i.test(trimmed)) urls.push(trimmed);
      } else if (Array.isArray(value)) {
        for (const item of value) push(item);
      }
    };
    const keys = [
      'imageUrl',
      'imageUrls',
      'sourceImageUrl',
      'referenceImageUrl',
      'referenceImageUrls',
      'referenceImages',
      'images',
      'image',
      'thumbnailUrl',
      'requestThumbnailUrl',
      'requestThumbnailUrls',
    ];
    for (const key of keys) {
      if (key in params) push(params[key]);
    }
    if (params.input && typeof params.input === 'object') {
      urls.push(
        ...this.collectImageUrlsFromParams(params.input as Record<string, unknown>),
      );
    }
    return Array.from(new Set(urls));
  }

  collectVideoUrlsFromParams(params?: Record<string, unknown> | null): string[] {
    if (!params || typeof params !== 'object') return [];
    const urls: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^https?:\/\//i.test(trimmed)) urls.push(trimmed);
      } else if (Array.isArray(value)) {
        for (const item of value) push(item);
      }
    };
    for (const key of ['videoUrl', 'videoUrls', 'referenceVideoUrl', 'referenceVideoUrls', 'video']) {
      if (key in params) push(params[key]);
    }
    return Array.from(new Set(urls));
  }

  async assertPromptParamsSafe(
    params?: Record<string, unknown> | null,
  ): Promise<void> {
    if (!this.isEnabled()) return;

    const texts = this.collectTextsFromParams(params);
    for (const text of texts) {
      await this.assertTextSafe(text, 'prompt');
    }

    const imageUrls = this.collectImageUrlsFromParams(params).slice(0, 6);
    for (const url of imageUrls) {
      await this.assertImageSafe(url, 'input_image');
    }

    const videoUrls = this.collectVideoUrlsFromParams(params).slice(0, 2);
    for (const url of videoUrls) {
      await this.assertVideoSafe(url, 'input_video');
    }
  }

  async assertGeneratedResultSafe(result: unknown): Promise<void> {
    if (!this.isEnabled()) return;

    const texts = this.collectGeneratedTexts(result);
    for (const text of texts) {
      await this.assertTextSafe(text, 'generated_text');
    }

    const imageUrls = this.collectGeneratedImageUrls(result).slice(0, 6);
    for (const url of imageUrls) {
      await this.assertImageSafe(url, 'generated_image');
    }

    const videoUrls = this.collectGeneratedVideoUrls(result).slice(0, 2);
    for (const url of videoUrls) {
      await this.assertVideoSafe(url, 'generated_video');
    }
  }

  async assertTextSafe(
    text: string,
    source: ContentModerationSource = 'prompt',
  ): Promise<ContentModerationDecision> {
    if (!this.isEnabled()) {
      return { blocked: false, source: 'none', message: '' };
    }
    try {
      const scan = await this.green.scanText(text);
      return this.decide(scan, source);
    } catch (error) {
      return this.handleProviderError(error, source, 'text');
    }
  }

  async assertImageSafe(
    imageUrl: string,
    source: ContentModerationSource = 'generated_image',
  ): Promise<ContentModerationDecision> {
    if (!this.isEnabled()) {
      return { blocked: false, source: 'none', message: '' };
    }
    try {
      const scan = await this.green.scanImage(imageUrl);
      return this.decide(scan, source);
    } catch (error) {
      return this.handleProviderError(error, source, 'image');
    }
  }

  async assertVideoSafe(
    videoUrl: string,
    source: ContentModerationSource = 'generated_video',
  ): Promise<ContentModerationDecision> {
    if (!this.isEnabled()) {
      return { blocked: false, source: 'none', message: '' };
    }
    try {
      const scan = await this.green.scanVideo(videoUrl);
      return this.decide(scan, source);
    } catch (error) {
      return this.handleProviderError(error, source, 'video');
    }
  }

  private decide(
    scan: {
      ok: boolean;
      riskLevel: string;
      labels: string[];
      requestId?: string;
      message?: string;
    },
    source: ContentModerationSource,
  ): ContentModerationDecision {
    const message = this.green.getBlockMessage();
    const sensitiveLabelHit = scan.labels.some((label) =>
      /porn|sexual|politic|violent|contraband|terror|gambl|drug|customized|inappropriate/i.test(
        label,
      ),
    );
    const riskBlocked = this.green.shouldBlockRiskLevel(scan.riskLevel);
    const blocked = scan.ok && (riskBlocked || sensitiveLabelHit);

    if (blocked) {
      this.logger.warn(
        `[ContentModeration] blocked source=${source} risk=${scan.riskLevel} labels=${scan.labels.join(',') || '-'} req=${scan.requestId || '-'}`,
      );
      throw new BadRequestException(message);
    }

    if (!scan.ok) {
      // 审核服务调用失败：默认 fail-open 并记日志，避免把业务全部打挂；
      // 可通过 ALIYUN_GREEN_FAIL_CLOSED=true 改为失败即拦截。
      const failClosed =
        (process.env.ALIYUN_GREEN_FAIL_CLOSED || '').trim().toLowerCase() ===
        'true';
      this.logger.error(
        `[ContentModeration] provider call failed source=${source} msg=${scan.message || 'unknown'} failClosed=${failClosed}`,
      );
      if (failClosed) {
        throw new ServiceUnavailableException(
          '内容安全审核服务暂时不可用，请稍后重试',
        );
      }
    }

    return {
      blocked: false,
      source,
      riskLevel: scan.riskLevel,
      labels: scan.labels,
      message: '',
      providerRequestId: scan.requestId,
    };
  }

  private handleProviderError(
    error: unknown,
    source: ContentModerationSource,
    kind: string,
  ): ContentModerationDecision {
    if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
      throw error;
    }
    const failClosed =
      (process.env.ALIYUN_GREEN_FAIL_CLOSED || '').trim().toLowerCase() ===
      'true';
    this.logger.error(
      `[ContentModeration] ${kind} exception source=${source}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    if (failClosed) {
      throw new ServiceUnavailableException(
        '内容安全审核服务暂时不可用，请稍后重试',
      );
    }
    return { blocked: false, source: 'none', message: '' };
  }

  private collectGeneratedTexts(result: unknown): string[] {
    if (!result || typeof result !== 'object') return [];
    const root = result as Record<string, any>;
    const data = root.data && typeof root.data === 'object' ? root.data : root;
    const texts: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) texts.push(value.trim());
    };
    push(data.textResponse);
    push(data.text);
    push(data.message);
    push(data.content);
    push(data.caption);
    push(data.reasoning);
    push(root.textResponse);
    push(root.text);
    push(root.message);
    push(root.content);
    push(root.reasoning);
    return Array.from(new Set(texts));
  }

  private collectGeneratedImageUrls(result: unknown): string[] {
    if (!result || typeof result !== 'object') return [];
    const root = result as Record<string, any>;
    const data = root.data && typeof root.data === 'object' ? root.data : root;
    const urls: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
        urls.push(value.trim());
      } else if (Array.isArray(value)) {
        for (const item of value) push(item);
      }
    };
    push(data.imageUrl);
    push(data.imageUrls);
    push(data.thumbnailUrl);
    push(root.imageUrl);
    push(root.imageUrls);
    return Array.from(new Set(urls));
  }

  private collectGeneratedVideoUrls(result: unknown): string[] {
    if (!result || typeof result !== 'object') return [];
    const root = result as Record<string, any>;
    const data = root.data && typeof root.data === 'object' ? root.data : root;
    const urls: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
        urls.push(value.trim());
      }
    };
    push(data.videoUrl);
    push(data.videoUrlRaw);
    push(data.videoUrlWatermarked);
    push(root.videoUrl);
    return Array.from(new Set(urls));
  }
}
