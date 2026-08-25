import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * 腾讯云实时 ASR（WebSocket）鉴权。
 *
 * 说明：
 * - 控制台「API 密钥」页只有 SecretId / SecretKey；
 * - WebSocket URL 仍要求账号 AppID：`wss://asr.cloud.tencent.com/asr/v2/{appid}?...`
 * - AppID 在「账号信息」页（主账号 APPID），不是密钥对里的字段。
 */
@Injectable()
export class TencentAsrAuthService {
  private readonly logger = new Logger(TencentAsrAuthService.name);
  private readonly appId: string;
  private readonly secretId: string;
  private readonly secretKey: string;
  private readonly engineModelType: string;

  constructor(private readonly config: ConfigService) {
    this.appId = (
      this.config.get<string>('TENCENT_ASR_APP_ID') ||
      this.config.get<string>('TENCENT_APP_ID') ||
      this.config.get<string>('TENCENT_CLOUD_APP_ID') ||
      ''
    ).trim();
    this.secretId = (
      this.config.get<string>('TENCENT_ASR_SECRET_ID') ||
      this.config.get<string>('TENCENT_MPS_SECRET_ID') ||
      ''
    ).trim();
    this.secretKey = (
      this.config.get<string>('TENCENT_ASR_SECRET_KEY') ||
      this.config.get<string>('TENCENT_MPS_SECRET_KEY') ||
      ''
    ).trim();
    this.engineModelType = (
      this.config.get<string>('TENCENT_ASR_ENGINE_MODEL_TYPE') || '16k_zh'
    ).trim();
  }

  isConfigured() {
    // SecretId/Key 是控制台密钥；AppID 是账号 APPID（协议路径仍必需）
    return Boolean(this.secretId && this.secretKey && this.appId);
  }

  getPublicConfig() {
    if (!this.secretId || !this.secretKey) {
      throw new ServiceUnavailableException(
        '腾讯云实时语音识别未配置：请设置 TENCENT_ASR_SECRET_ID / TENCENT_ASR_SECRET_KEY（可复用 MPS 密钥）',
      );
    }
    if (!this.appId) {
      throw new ServiceUnavailableException(
        '腾讯云实时语音识别缺少账号 AppID：请在「账号信息」页复制主账号 APPID，配置 TENCENT_ASR_APP_ID（密钥页只有 Id/Key，不含 AppID）',
      );
    }
    return {
      available: true as const,
      appId: this.appId,
      secretId: this.secretId,
      engineModelType: this.engineModelType,
    };
  }

  /**
   * 为前端 SDK signCallback 生成 HMAC-SHA1 + Base64 签名。
   * signStr 形如：asr.cloud.tencent.com/asr/v2/{appid}?engine_model_type=...
   */
  sign(signStr: string) {
    const normalized = String(signStr || '').trim();
    if (!normalized) {
      throw new BadRequestException('signStr 不能为空');
    }
    if (!normalized.startsWith('asr.cloud.tencent.com/asr/v2/')) {
      throw new BadRequestException('非法的签名原文');
    }
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('腾讯云实时语音识别未配置');
    }

    const digest = crypto
      .createHmac('sha1', this.secretKey)
      .update(normalized)
      .digest();
    const signature = digest.toString('base64');
    this.logger.debug(`ASR sign ok, appId=${this.appId}`);
    return { signature };
  }
}
