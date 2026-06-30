import { BadRequestException, Injectable } from '@nestjs/common';
import {
  resolveVolcVideoEnhanceBillingResolution,
  resolveVolcVideoEnhanceFpsTier,
  VOLC_VIDEO_ENHANCE_PRICE_MATRIX,
  type VolcVideoEnhanceBillingResolution,
  type VolcVideoEnhanceFpsTier,
  type VolcVideoEnhanceToolVersion,
} from '../constants/volc-video-enhance.constants';

export type VolcVideoEnhancePricingInput = {
  toolVersion: VolcVideoEnhanceToolVersion;
  resolution?: string | null;
  resolutionLimit?: number | null;
  fps?: number | null;
};

export type VolcVideoEnhancePricingQuote = {
  credits: number;
  billingResolution: VolcVideoEnhanceBillingResolution;
  fpsTier: VolcVideoEnhanceFpsTier;
};

@Injectable()
export class VolcVideoEnhancePricingService {
  resolveQuote(input: VolcVideoEnhancePricingInput): VolcVideoEnhancePricingQuote {
    const billingResolution = resolveVolcVideoEnhanceBillingResolution(input);
    const fpsTier = resolveVolcVideoEnhanceFpsTier(input.fps);
    const versionMatrix = VOLC_VIDEO_ENHANCE_PRICE_MATRIX[input.toolVersion];
    const credits = versionMatrix?.[billingResolution]?.[fpsTier];

    if (!Number.isFinite(credits)) {
      throw new BadRequestException('视频增强计费参数无效');
    }

    return {
      credits,
      billingResolution,
      fpsTier,
    };
  }
}

