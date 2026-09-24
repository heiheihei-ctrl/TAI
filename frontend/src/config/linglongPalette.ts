import { getDeploymentBrand } from './deploymentBrand';
import {
  isAllowedForLinglongPalette,
  isAllowedNodeKeyForLinglongPalette,
} from './internationalEditionNodes';
import type { NodeConfig } from '@/services/nodeConfigService';

export function isLinglongRestrictedPalette(): boolean {
  return getDeploymentBrand() === 'linglong';
}

/**
 * 玲珑隐藏：
 * - Seedream 全系
 * - seedance20Video（与 doubaoVideo 重复，面板只保留一个 Seedance）
 */
const LINGLONG_HIDDEN_NODE_KEYS = new Set([
  'seedream5',
  'seedream5Pro',
  'seedance20Video',
]);

export function shouldHideNodeForDeploymentPalette(
  nodeKey?: string | null,
  config?: Partial<NodeConfig> | null,
  creditsPerCall = 0,
): boolean {
  if (!isLinglongRestrictedPalette()) return false;
  const key = String(nodeKey || config?.nodeKey || '').trim();
  if (key && LINGLONG_HIDDEN_NODE_KEYS.has(key)) return true;
  if (config) {
    // seedance20Video 即使被识别为 Seedance 也隐藏，避免双入口
    if (key === 'seedance20Video') return true;
    return !isAllowedForLinglongPalette(config);
  }
  return !isAllowedNodeKeyForLinglongPalette(nodeKey, creditsPerCall);
}
