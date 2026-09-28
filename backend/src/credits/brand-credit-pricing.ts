import { type DeploymentBrand, getDeploymentBrand } from '../config/deployment-brand';

export const LINGLONG_CREDIT_MULTIPLIER = 1.5;
/** Linglong gpt-image-2：相对 TAI 价上浮 85% */
export const LINGLONG_GPT_IMAGE_2_CREDIT_MULTIPLIER = 1.85;

export type Seedream5ProResolution = '1K' | '1.5K' | '2K';
export type Seedream5Resolution = '1K' | '2K' | '4K';

export type ResolutionCreditsMap = Record<Seedream5ProResolution, number>;

const TAI_SEEDREAM5_PRO_CREDITS: ResolutionCreditsMap = {
  '1K': 65,
  '1.5K': 90,
  '2K': 140,
};

const TAI_SEEDREAM5_CREDITS: Record<Seedream5Resolution, number> = {
  '1K': 30,
  '2K': 30,
  '4K': 60,
};

/** serviceType → linglong 相对 TAI 的倍率 */
const LINGLONG_SERVICE_MULTIPLIERS: Record<string, number> = {
  'doubao-seedream-5-0-260128': LINGLONG_CREDIT_MULTIPLIER,
  'doubao-seedream-5-0-pro-260628': LINGLONG_CREDIT_MULTIPLIER,
  'doubao-video': LINGLONG_CREDIT_MULTIPLIER,
  'gpt-image-2': LINGLONG_GPT_IMAGE_2_CREDIT_MULTIPLIER,
};

function scaleCredits(base: number, multiplier: number): number {
  return Math.ceil(base * multiplier);
}

function scaleResolutionMap<T extends Record<string, number>>(
  base: T,
  brand: DeploymentBrand,
): T {
  if (brand !== 'linglong') return { ...base };
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [
      key,
      scaleCredits(value, LINGLONG_CREDIT_MULTIPLIER),
    ]),
  ) as T;
}

export function resolveDeploymentBrand(override?: unknown): DeploymentBrand {
  if (override === 'linglong' || override === 'tai') return override;
  return getDeploymentBrand();
}

export function isLinglongPricedServiceType(serviceType: string): boolean {
  return Object.prototype.hasOwnProperty.call(LINGLONG_SERVICE_MULTIPLIERS, serviceType);
}

export function applyLinglongCreditMultiplier(
  credits: number,
  serviceType: string,
  brand: DeploymentBrand = getDeploymentBrand(),
): number {
  if (brand !== 'linglong') return credits;
  const multiplier = LINGLONG_SERVICE_MULTIPLIERS[serviceType];
  if (!multiplier || !Number.isFinite(credits) || credits <= 0) return credits;
  return scaleCredits(credits, multiplier);
}

export function getSeedream5ProResolutionPricing(
  brand: DeploymentBrand = getDeploymentBrand(),
): ResolutionCreditsMap {
  return scaleResolutionMap(TAI_SEEDREAM5_PRO_CREDITS, brand);
}

export function getSeedream5ResolutionPricing(
  brand: DeploymentBrand = getDeploymentBrand(),
): Record<Seedream5Resolution, number> {
  return scaleResolutionMap(TAI_SEEDREAM5_CREDITS, brand);
}
