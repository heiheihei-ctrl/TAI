export type DeploymentBrand = 'tai' | 'linglong';

/**
 * 部署品牌：与后端 `DEPLOYMENT_BRAND` 保持一致，用于前端积分展示兜底。
 * 环境变量：`VITE_DEPLOYMENT_BRAND=tai|linglong`（默认 `tai`）
 */
export function getDeploymentBrand(): DeploymentBrand {
  const raw = String(import.meta.env.VITE_DEPLOYMENT_BRAND || 'tai').trim().toLowerCase();
  if (raw === 'linglong') return 'linglong';
  return 'tai';
}
