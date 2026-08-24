import { getDeploymentBrand } from './deploymentBrand';
import {
  isAllowedForSeedreamSeedancePalette,
  isAllowedNodeKeyForSeedreamSeedancePalette,
} from './internationalEditionNodes';
import type { NodeConfig } from '@/services/nodeConfigService';

export function isLinglongRestrictedPalette(): boolean {
  return getDeploymentBrand() === 'linglong';
}

export function shouldHideNodeForDeploymentPalette(
  nodeKey?: string | null,
  config?: Partial<NodeConfig> | null,
  creditsPerCall = 0,
): boolean {
  if (!isLinglongRestrictedPalette()) return false;
  if (config) {
    return !isAllowedForSeedreamSeedancePalette(config);
  }
  return !isAllowedNodeKeyForSeedreamSeedancePalette(nodeKey, creditsPerCall);
}
