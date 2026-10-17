import { fetchWithAuth } from './authFetch';

export interface SupplyChainGalleryItem {
  id: string;
  name: string;
  scene: string;
  imageUrl: string;
  isActive: boolean;
}

const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');

async function request(path: string, options?: RequestInit): Promise<SupplyChainGalleryItem[]> {
  const response = await fetchWithAuth(`${base}/api/${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || '图库加载失败，请稍后重试');
  }
  return response.json();
}

export const supplyChainGalleryApi = {
  list: () => request('settings/supply-chain-gallery'),
  listForAdmin: () => request('admin/supply-chain-gallery'),
  save: (items: SupplyChainGalleryItem[]) => request('admin/supply-chain-gallery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  }),
};
