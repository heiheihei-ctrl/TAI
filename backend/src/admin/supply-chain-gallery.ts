import { BadRequestException } from '@nestjs/common';

export const SUPPLY_CHAIN_GALLERY_KEY = 'linglong_supply_chain_gallery';

export interface SupplyChainGalleryItem {
  id: string;
  name: string;
  scene: string;
  imageUrl: string;
  isActive: boolean;
}

export function validateSupplyChainGallery(value: unknown): SupplyChainGalleryItem[] {
  if (!Array.isArray(value) || value.length > 5000) {
    throw new BadRequestException('图库必须为数组，最多支持 5000 张图片');
  }
  const ids = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new BadRequestException('无效的图库图片');
    const item = entry as Record<string, unknown>;
    const text = (key: string, max: number) => {
      const field = typeof item[key] === 'string' ? item[key].trim() : '';
      if (!field || field.length > max) throw new BadRequestException(`图库字段 ${key} 无效`);
      return field;
    };
    const id = text('id', 100);
    if (ids.has(id)) throw new BadRequestException('图库图片 ID 重复');
    ids.add(id);
    const imageUrl = text('imageUrl', 2048);
    let validUrl = /^\/(?!\/)/.test(imageUrl) && !/[\\\s]/.test(imageUrl);
    try {
      const url = new URL(imageUrl);
      validUrl = (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
    } catch { /* Local managed upload paths are also supported. */ }
    if (!validUrl) throw new BadRequestException('图库图片必须先上传，不能保存临时地址或内联图片');
    if (typeof item.isActive !== 'boolean') throw new BadRequestException('图片上架状态无效');
    return { id, name: text('name', 200), scene: text('scene', 100), imageUrl, isActive: item.isActive };
  });
}

export function parseSupplyChainGallery(value?: string | null): SupplyChainGalleryItem[] {
  if (!value) return [];
  return validateSupplyChainGallery(JSON.parse(value));
}
