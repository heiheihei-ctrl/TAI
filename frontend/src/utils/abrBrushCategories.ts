import type { AbrBrushPreset } from '@/types/abrBrush';
import { stripBrushNamePrefix } from '@/utils/abrBrushLabels';
import { isZhLanguage } from '@/utils/localeText';

export type BrushCategoryId =
  | 'comic'
  | 'pencil-brush'
  | 'pencil'
  | 'charcoal'
  | 'pastel'
  | 'dry-brush'
  | 'blender'
  | 'eraser'
  | 'other';

export type BrushCategory = {
  id: BrushCategoryId;
  labelZh: string;
  labelEn: string;
};

export const BRUSH_CATEGORIES: BrushCategory[] = [
  { id: 'comic', labelZh: '漫画笔刷', labelEn: 'Comic Brushes' },
  { id: 'pencil-brush', labelZh: '铅笔笔刷', labelEn: 'Pencil Brushes' },
  { id: 'pencil', labelZh: '铅笔', labelEn: 'Pencils' },
  { id: 'charcoal', labelZh: '炭笔', labelEn: 'Charcoal' },
  { id: 'pastel', labelZh: '色粉笔', labelEn: 'Pastels' },
  { id: 'dry-brush', labelZh: '干笔刷', labelEn: 'Dry Brushes' },
  { id: 'blender', labelZh: '晕染涂抹', labelEn: 'Blenders' },
  { id: 'eraser', labelZh: '橡皮擦', labelEn: 'Erasers' },
  { id: 'other', labelZh: '其他', labelEn: 'Other' },
];

const CATEGORY_ORDER: BrushCategoryId[] = BRUSH_CATEGORIES.map((cat) => cat.id);

const getDryMediaCategoryId = (name: string): BrushCategoryId => {
  const shortName = stripBrushNamePrefix(name).toLowerCase();

  if (/eraser/.test(shortName)) return 'eraser';
  if (/pencil|\d+b\b|hb\b/.test(shortName)) return 'pencil';
  if (/charcoal|vine|stump/.test(shortName)) return 'charcoal';
  if (/pastel|crayon|conte/.test(shortName)) return 'pastel';
  if (/blender|smudge/.test(shortName)) return 'blender';
  if (/brush/.test(shortName)) return 'dry-brush';

  return 'other';
};

export const getBrushCategoryId = (brush: AbrBrushPreset): BrushCategoryId => {
  if (brush.packId === 'comic') return 'comic';
  if (brush.packId === 'pencil-brush') return 'pencil-brush';
  return getDryMediaCategoryId(brush.name);
};

export const getBrushCategoryLabel = (
  categoryId: BrushCategoryId,
  language?: string | null,
): string => {
  const category = BRUSH_CATEGORIES.find((cat) => cat.id === categoryId);
  if (!category) return categoryId;
  const isZh = isZhLanguage(language);
  return isZh ? category.labelZh : category.labelEn;
};

export const groupBrushesByCategory = (
  brushes: AbrBrushPreset[],
): Map<BrushCategoryId, AbrBrushPreset[]> => {
  const grouped = new Map<BrushCategoryId, AbrBrushPreset[]>();
  for (const categoryId of CATEGORY_ORDER) {
    grouped.set(categoryId, []);
  }

  for (const brush of brushes) {
    const categoryId = getBrushCategoryId(brush);
    grouped.get(categoryId)?.push(brush);
  }

  return grouped;
};

export const getVisibleBrushCategories = (
  brushes: AbrBrushPreset[],
): BrushCategory[] => {
  const grouped = groupBrushesByCategory(brushes);
  return BRUSH_CATEGORIES.filter((cat) => (grouped.get(cat.id)?.length ?? 0) > 0);
};

export const filterBrushesByCategory = (
  brushes: AbrBrushPreset[],
  categoryId: BrushCategoryId | '',
): AbrBrushPreset[] => {
  if (!categoryId) return brushes;
  return brushes.filter((brush) => getBrushCategoryId(brush) === categoryId);
};
