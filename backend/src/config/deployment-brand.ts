export type DeploymentBrand = 'tai' | 'linglong';

/**
 * 部署品牌：用于区分不同产品线的积分报价、上游路由、上传落盘等配置。
 * 环境变量：`DEPLOYMENT_BRAND=tai|linglong`（默认 `tai`）
 * linglong 时：Seedream/Seedance 走天翼云；上传默认 `UPLOAD_MODE=local`（可显式覆盖）
 */
export function getDeploymentBrand(): DeploymentBrand {
  const raw = String(process.env.DEPLOYMENT_BRAND || 'tai').trim().toLowerCase();
  if (raw === 'linglong') return 'linglong';
  return 'tai';
}
