import { type DeploymentBrand, getDeploymentBrand } from './deploymentBrand';

export type Seedream5ProResolution = '1K' | '1.5K' | '2K';
export type Seedream5Resolution = '1K' | '2K' | '4K';

export const LINGLONG_CREDIT_MULTIPLIER = 1.5;

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

function scaleCredits(base: number, brand: DeploymentBrand): number {
  if (brand !== 'linglong') return base;
  return Math.ceil(base * LINGLONG_CREDIT_MULTIPLIER);
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

/** Seedance 2.5 默认 5 秒 × 720P(240/s) */
export function getSeedance25FallbackCredits(
  brand: DeploymentBrand = getDeploymentBrand(),
): number {
  return scaleCredits(1200, brand);
}

export function applyLinglongCreditMultiplier(
  credits: number,
  brand: DeploymentBrand = getDeploymentBrand(),
): number {
  return scaleCredits(credits, brand);
}
