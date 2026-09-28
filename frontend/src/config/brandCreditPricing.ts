import { type DeploymentBrand, getDeploymentBrand } from './deploymentBrand';

export type Seedream5ProResolution = '1K' | '1.5K' | '2K';
export type Seedream5Resolution = '1K' | '2K' | '4K';

export const LINGLONG_CREDIT_MULTIPLIER = 1.5;
/** Linglong gpt-image-2：相对 TAI 价上浮 85% */
export const LINGLONG_GPT_IMAGE_2_CREDIT_MULTIPLIER = 1.85;

const TAI_SEEDREAM5_PRO_CREDITS: Record<Seedream5ProResolution, number> = {
  '1K': 65,
  '1.5K': 90,
  '2K': 140,
};

const TAI_SEEDREAM5_CREDITS: Record<Seedream5Resolution, number> = {
  '1K': 30,
  '2K': 30,
  '4K': 60,
};

const TAI_SEEDANCE_FALLBACK_CREDITS = 600;

function scaleCredits(base: number, brand: DeploymentBrand, multiplier = LINGLONG_CREDIT_MULTIPLIER): number {
  if (brand !== 'linglong') return base;
  return Math.ceil(base * multiplier);
}

export function getSeedream5ProCredits(
  resolution: Seedream5ProResolution = '2K',
  brand: DeploymentBrand = getDeploymentBrand(),
): number {
  return scaleCredits(TAI_SEEDREAM5_PRO_CREDITS[resolution], brand);
}

export function getSeedream5Credits(
  resolution: Seedream5Resolution = '2K',
  brand: DeploymentBrand = getDeploymentBrand(),
): number {
  return scaleCredits(TAI_SEEDREAM5_CREDITS[resolution], brand);
}

export function getSeedanceFallbackCredits(
  brand: DeploymentBrand = getDeploymentBrand(),
): number {
  return scaleCredits(TAI_SEEDANCE_FALLBACK_CREDITS, brand);
}

/** Seedance 2.5 默认 5 秒 × 720P(240/s) × 8 折 */
export function getSeedance25FallbackCredits(
  brand: DeploymentBrand = getDeploymentBrand(),
): number {
  return scaleCredits(Math.round(1200 * 0.8), brand);
}

export function applyLinglongCreditMultiplier(
  credits: number,
  brand: DeploymentBrand = getDeploymentBrand(),
): number {
  return scaleCredits(credits, brand);
}

/** Linglong 下 gpt-image-2 积分 = TAI 价 × 1.85（上浮 85%）向上取整 */
export function applyLinglongGptImage2CreditMultiplier(
  credits: number,
  brand: DeploymentBrand = getDeploymentBrand(),
): number {
  if (!Number.isFinite(credits) || credits <= 0) return credits;
  return scaleCredits(credits, brand, LINGLONG_GPT_IMAGE_2_CREDIT_MULTIPLIER);
}
