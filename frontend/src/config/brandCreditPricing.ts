import { type DeploymentBrand, getDeploymentBrand } from './deploymentBrand';

export type Seedream5ProResolution = '1K' | '1.5K' | '2K';

const SEEDREAM5_PRO_RESOLUTION_CREDITS: Record<
  DeploymentBrand,
  Record<Seedream5ProResolution, number>
> = {
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

export function getSeedream5ProCredits(
  resolution: Seedream5ProResolution = '2K',
  brand: DeploymentBrand = getDeploymentBrand(),
): number {
  return SEEDREAM5_PRO_RESOLUTION_CREDITS[brand][resolution];
}
