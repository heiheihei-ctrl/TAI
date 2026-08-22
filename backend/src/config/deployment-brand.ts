export type DeploymentBrand = 'tai' | 'linglong';

/**
 * 部署品牌：用于区分不同产品线的积分报价等配置。
 * 环境变量：`DEPLOYMENT_BRAND=tai|linglong`（默认 `tai`）
 */
export function getDeploymentBrand(): DeploymentBrand {
  const raw = String(process.env.DEPLOYMENT_BRAND || 'tai').trim().toLowerCase();
  if (raw === 'linglong') return 'linglong';
  return 'tai';
}
