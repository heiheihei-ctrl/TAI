import { type DeploymentBrand, getDeploymentBrand } from '../config/deployment-brand';

export const LINGLONG_CREDIT_MULTIPLIER = 1.5;

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

const LINGLONG_PRICED_SERVICE_TYPES = new Set<string>([
  'doubao-seedream-5-0-260128',
  'doubao-seedream-5-0-pro-260628',
  'doubao-video',
]);

function scaleCredits(base: number, brand: DeploymentBrand): number {
  if (brand !== 'linglong') return base;
  return Math.ceil(base * LINGLONG_CREDIT_MULTIPLIER);
}

function scaleResolutionMap<T extends Record<string, number>>(
  base: T,
  brand: DeploymentBrand,
): T {
  if (brand !== 'linglong') return { ...base };
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, scaleCredits(value, 'linglong')]),
  ) as T;
}

export function resolveDeploymentBrand(override?: unknown): DeploymentBrand {
  if (override === 'linglong' || override === 'tai') return override;
  return getDeploymentBrand();
}

export function isLinglongPricedServiceType(serviceType: string): boolean {
  return LINGLONG_PRICED_SERVICE_TYPES.has(serviceType);
}

export function applyLinglongCreditMultiplier(
  credits: number,
  serviceType: string,
  brand: DeploymentBrand = getDeploymentBrand(),
): number {
  if (brand !== 'linglong' || !isLinglongPricedServiceType(serviceType)) {
    return credits;
  }
  return scaleCredits(credits, 'linglong');
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
