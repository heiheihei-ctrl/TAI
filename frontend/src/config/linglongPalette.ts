import { getDeploymentBrand } from './deploymentBrand';
import {
  isAllowedForSeedreamSeedancePalette,
  isAllowedNodeKeyForSeedreamSeedancePalette,
} from './internationalEditionNodes';
import type { NodeConfig } from '@/services/nodeConfigService';

export function isLinglongRestrictedPalette(): boolean {
  return getDeploymentBrand() === 'linglong';
}

/** 玲珑面板额外隐藏的节点（仅 1.5 Pro，不含 Seedance 2.x 入口） */
const LINGLONG_HIDDEN_NODE_KEYS = new Set(['seedance20Video']);

export function shouldHideNodeForDeploymentPalette(
  nodeKey?: string | null,
  config?: Partial<NodeConfig> | null,
  creditsPerCall = 0,
): boolean {
  if (!isLinglongRestrictedPalette()) return false;
  const key = String(nodeKey || config?.nodeKey || '').trim();
  if (key && LINGLONG_HIDDEN_NODE_KEYS.has(key)) return true;
  if (config) {
    return !isAllowedForSeedreamSeedancePalette(config);
  }
  return !isAllowedNodeKeyForSeedreamSeedancePalette(nodeKey, creditsPerCall);
}
