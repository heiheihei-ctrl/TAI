/** 公共模板一级分类 */
export const TEMPLATE_PARENT_CATEGORIES = ['建筑', '其他'] as const;

export type TemplateParentCategory = (typeof TEMPLATE_PARENT_CATEGORIES)[number];

export const TEMPLATE_CATEGORY_PARENT_GROUPS_KEY = 'template_category_parent_groups';
export const TEMPLATE_CATEGORIES_KEY = 'template_categories';

/** 归属「建筑」一级分类的二级分类（精确匹配） */
export const ARCHITECTURE_SECONDARY_CATEGORIES = ['建筑设计', '空间设计'] as const;

export function isArchitectureSecondaryCategory(category: string): boolean {
  const trimmed = typeof category === 'string' ? category.trim() : '';
  return (ARCHITECTURE_SECONDARY_CATEGORIES as readonly string[]).includes(trimmed);
}

export function isTemplateParentCategory(value: unknown): value is TemplateParentCategory {
  return typeof value === 'string' && (TEMPLATE_PARENT_CATEGORIES as readonly string[]).includes(value);
}

export function emptyCategoryParentGroups(): Record<TemplateParentCategory, string[]> {
  return { 建筑: [], 其他: [] };
}

export function normalizeCategoryParentGroups(
  input: unknown,
): Record<TemplateParentCategory, string[]> {
  const result = emptyCategoryParentGroups();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return result;
  }

  for (const parent of TEMPLATE_PARENT_CATEGORIES) {
    const list = (input as Record<string, unknown>)[parent];
    if (!Array.isArray(list)) continue;
    result[parent] = Array.from(
      new Set(
        list
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
          .filter((item) => !isTemplateParentCategory(item)),
      ),
    );
  }

  return result;
}

export function flattenSecondaryCategories(
  groups: Record<TemplateParentCategory, string[]>,
): string[] {
  const merged = [...groups.建筑, ...groups.其他];
  return Array.from(new Set(merged));
}

export function buildDefaultCategoryParentGroups(
  secondaryCategories: string[],
): Record<TemplateParentCategory, string[]> {
  const groups = emptyCategoryParentGroups();
  const unique = Array.from(
    new Set(
      secondaryCategories
        .map((item) => item?.trim())
        .filter(Boolean)
        .filter((item) => !isTemplateParentCategory(item)),
    ),
  );

  for (const category of unique) {
    if (isArchitectureSecondaryCategory(category)) {
      groups.建筑.push(category);
    } else {
      groups.其他.push(category);
    }
  }

  return groups;
}

export function reconcileCategoryParentGroups(
  secondaryCategories: string[],
): Record<TemplateParentCategory, string[]> {
  return buildDefaultCategoryParentGroups(secondaryCategories);
}

export function resolveParentCategoryForSecondary(
  groups: Record<TemplateParentCategory, string[]>,
  secondaryCategory?: string | null,
): TemplateParentCategory | null {
  const trimmed = typeof secondaryCategory === 'string' ? secondaryCategory.trim() : '';
  if (!trimmed) return null;
  if (groups.建筑.includes(trimmed)) return '建筑';
  if (groups.其他.includes(trimmed)) return '其他';
  return null;
}

export function getSecondaryCategoriesForParent(
  groups: Record<TemplateParentCategory, string[]>,
  parentCategory?: string | null,
): string[] | null {
  if (!parentCategory || !isTemplateParentCategory(parentCategory)) {
    return null;
  }
  return groups[parentCategory];
}
