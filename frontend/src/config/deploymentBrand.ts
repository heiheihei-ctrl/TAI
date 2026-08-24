export type DeploymentBrand = 'tai' | 'linglong';

const RUNTIME_BRAND_STORAGE_KEY = 'tanva-runtime-deployment-brand';

function readEnvDeploymentBrand(): DeploymentBrand {
  const raw = String(import.meta.env.VITE_DEPLOYMENT_BRAND || 'tai').trim().toLowerCase();
  if (raw === 'linglong') return 'linglong';
  return 'tai';
}

/**
 * 部署品牌：与后端 `DEPLOYMENT_BRAND` 保持一致，用于前端积分展示兜底。
 * 登录页可经「玲珑生态会员」写入运行时覆盖（localStorage）。
 * 环境变量：`VITE_DEPLOYMENT_BRAND=tai|linglong`（默认 `tai`）
 */
export function getDeploymentBrand(): DeploymentBrand {
  try {
    const stored = localStorage.getItem(RUNTIME_BRAND_STORAGE_KEY);
    if (stored === 'linglong' || stored === 'tai') {
      return stored;
    }
  } catch {
    // ignore
  }
  return readEnvDeploymentBrand();
}

/** 登录页切换身份时写入；`tai` 会清除运行时覆盖。 */
export function setRuntimeDeploymentBrand(brand: DeploymentBrand): void {
  try {
    if (brand === 'tai') {
      localStorage.removeItem(RUNTIME_BRAND_STORAGE_KEY);
      return;
    }
    localStorage.setItem(RUNTIME_BRAND_STORAGE_KEY, brand);
  } catch {
    // ignore
  }
}
