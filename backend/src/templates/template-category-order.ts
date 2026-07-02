/** 公共模板分类：置顶顺序（建筑设计、美育设计优先） */
export const PRIORITY_PUBLIC_TEMPLATE_CATEGORIES = ['建筑设计', '美育设计'] as const;

export const OTHER_PUBLIC_TEMPLATE_CATEGORY = '其他';

export function sortPublicTemplateCategories(categories: string[]): string[] {
  const filtered = categories.map((c) => c?.trim()).filter(Boolean) as string[];
  const unique = Array.from(new Set(filtered));

  const other = unique.filter((c) => c === OTHER_PUBLIC_TEMPLATE_CATEGORY);
  const rest = unique.filter((c) => c !== OTHER_PUBLIC_TEMPLATE_CATEGORY);

  const priority = PRIORITY_PUBLIC_TEMPLATE_CATEGORIES.filter((c) => rest.includes(c));
  const remaining = rest
    .filter((c) => !PRIORITY_PUBLIC_TEMPLATE_CATEGORIES.includes(c as (typeof PRIORITY_PUBLIC_TEMPLATE_CATEGORIES)[number]))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));

  return [...priority, ...remaining, ...other];
}

export function getPublicTemplateCategoryRank(category?: string | null): number {
  if (!category) return PRIORITY_PUBLIC_TEMPLATE_CATEGORIES.length + 1;
  const trimmed = category.trim();
  const idx = PRIORITY_PUBLIC_TEMPLATE_CATEGORIES.indexOf(
    trimmed as (typeof PRIORITY_PUBLIC_TEMPLATE_CATEGORIES)[number],
  );
  if (idx >= 0) return idx;
  if (trimmed === OTHER_PUBLIC_TEMPLATE_CATEGORY) return 999;
  return PRIORITY_PUBLIC_TEMPLATE_CATEGORIES.length + 1;
}
