import { type DeploymentBrand, getDeploymentBrand } from '../config/deployment-brand';

export type Seedream5ProResolution = '1K' | '1.5K' | '2K';

export type ResolutionCreditsMap = Record<Seedream5ProResolution, number>;

const SEEDREAM5_PRO_RESOLUTION_CREDITS: Record<DeploymentBrand, ResolutionCreditsMap> = {
  tai: {
    '1K': 65,
    '1.5K': 90,
    '2K': 140,
  },
  linglong: {
    '1K': 100,
    '1.5K': 130,
    '2K': 180,
  },
};

export function getSeedream5ProResolutionPricing(
  brand: DeploymentBrand = getDeploymentBrand(),
): ResolutionCreditsMap {
  return { ...SEEDREAM5_PRO_RESOLUTION_CREDITS[brand] };
}
