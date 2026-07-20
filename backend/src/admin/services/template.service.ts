import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  getPublicTemplateCategoryRank,
  sortPublicTemplateCategories,
} from '../../templates/template-category-order';
import {
  buildDefaultCategoryParentGroups,
  flattenSecondaryCategories,
  getSecondaryCategoriesForParent,
  isArchitectureSecondaryCategory,
  isTemplateParentCategory,
  normalizeCategoryParentGroups,
  reconcileCategoryParentGroups,
  TEMPLATE_CATEGORIES_KEY,
  TEMPLATE_CATEGORY_PARENT_GROUPS_KEY,
  TEMPLATE_PARENT_CATEGORIES,
  type TemplateParentCategory,
} from '../../templates/template-category-groups';
import { CreateTemplateDto, UpdateTemplateDto, TemplateQueryDto } from '../dto/template.dto';
import { OssService } from '../../oss/oss.service';
import { sanitizeDesignJson } from '../../utils/designJsonSanitizer';

const sanitizeNullableString = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const sanitized = sanitizeDesignJson(value);
  return typeof sanitized === 'string' ? sanitized : null;
};

@Injectable()
export class TemplateService {
  private static readonly FREE_TIER_BENEFITS_SETTING_KEY = 'membership_free_tier_benefits';

  constructor(private readonly prisma: PrismaService, private readonly oss: OssService) {}

  private isVipOnlyTemplate(tags?: string[] | null): boolean {
    if (!Array.isArray(tags) || tags.length === 0) {
      return false;
    }

    const normalizedTags = tags
      .map((tag) => String(tag).trim().toLowerCase())
      .filter(Boolean);

    return normalizedTags.some((tag) => tag === 'vip' || tag === 'vip-only' || tag === '仅vip');
  }

  private normalizeTemplateLibraryAccess(value: unknown): 'basic' | 'full' {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (
      normalized === 'full' ||
      normalized === 'all' ||
      normalized === '全部开放' ||
      normalized === '全部'
    ) {
      return 'full';
    }
    return 'basic';
  }

  private async getFreeTierTemplateLibraryAccess(): Promise<'basic' | 'full'> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: TemplateService.FREE_TIER_BENEFITS_SETTING_KEY },
      select: { value: true },
    });
    if (!setting?.value) {
      return 'basic';
    }

    try {
      const parsed = JSON.parse(setting.value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return this.normalizeTemplateLibraryAccess(
          (parsed as Record<string, unknown>).templateLibraryAccess,
        );
      }
    } catch {
      return 'basic';
    }

    return 'basic';
  }

  private async resolveUserTemplateLibraryAccess(userId: string): Promise<'basic' | 'full'> {
    const subscription = await this.prisma.userMembershipSubscription.findFirst({
      where: {
        userId,
        status: 'active',
        currentPeriodStartAt: { lte: new Date() },
        currentPeriodEndAt: { gt: new Date() },
      },
      select: {
        membershipPlanId: true,
      },
      orderBy: [{ currentPeriodEndAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!subscription?.membershipPlanId) {
      return this.getFreeTierTemplateLibraryAccess();
    }

    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: subscription.membershipPlanId },
      select: { metadata: true },
    });

    if (plan?.metadata && typeof plan.metadata === 'object' && !Array.isArray(plan.metadata)) {
      return this.normalizeTemplateLibraryAccess(
        (plan.metadata as Record<string, unknown>).templateLibraryAccess,
      );
    }

    return 'basic';
  }

  async canUserUseTemplate(templateId: string, userId: string): Promise<boolean> {
    const template = await this.prisma.publicTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        tags: true,
      },
    });

    if (!template) {
      throw new NotFoundException('模板不存在');
    }

    if (!this.isVipOnlyTemplate(template.tags)) {
      return true;
    }

    return (await this.resolveUserTemplateLibraryAccess(userId)) === 'full';
  }

  async createTemplate(dto: CreateTemplateDto, createdBy?: string) {
    let templateData = dto.templateData;
    if (!templateData && dto.templateJsonKey) {
      // 从 OSS 拉取 JSON 内容
      const json = await this.oss.getJSON(dto.templateJsonKey);
      if (!json) {
        throw new Error(`无法从 OSS 读取模板 JSON 文件: ${dto.templateJsonKey}`);
      }
      templateData = json;
    }
    // 只有当既没有 templateData 也没有 templateJsonKey 时才设为空对象
    if (
      (templateData === undefined || templateData === null) &&
      !dto.templateJsonKey
    ) {
      templateData = {};
    }
    if (templateData) {
      templateData = sanitizeDesignJson(templateData);
    }

    // 名称默认为 "未命名模板"
    const name = dto.name?.trim() || '未命名模板';

    return this.prisma.publicTemplate.create({
      data: {
        name,
        category: dto.category,
        description: dto.description,
        tags: dto.tags || [],
        thumbnail: sanitizeNullableString(dto.thumbnail),
        thumbnailSmall: sanitizeNullableString(dto.thumbnailSmall),
        templateData,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async getTemplates(query: TemplateQueryDto) {
    const { page = 1, pageSize = 10, category, parentCategory, isActive, search } = query;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (category) {
      where.category = category;
    } else if (parentCategory && isTemplateParentCategory(parentCategory)) {
      const groups = await this.getCategoryParentGroups();
      const secondary = getSecondaryCategoriesForParent(groups, parentCategory) ?? [];
      if (secondary.length === 0) {
        return { items: [], total: 0, page, pageSize, totalPages: 0 };
      }
      where.category = { in: secondary };
    }

    if (typeof isActive === 'boolean') {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { hasSome: [search] } },
      ];
    }

    const [templates, total] = await Promise.all([
      this.prisma.publicTemplate.findMany({
        where,
        orderBy: [
          { sortOrder: 'desc' },
          { updatedAt: 'desc' },
        ],
        skip,
        take: pageSize,
      }),
      this.prisma.publicTemplate.count({ where }),
    ]);

    return {
      items: templates,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getTemplateById(id: string) {
    const template = await this.prisma.publicTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('模板不存在');
    }

    return template;
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto, updatedBy?: string) {
    const template = await this.getTemplateById(id);
    let resolvedTemplateData = dto.templateData;
    if (resolvedTemplateData === undefined && (dto as any).templateJsonKey) {
      const json = await this.oss.getJSON((dto as any).templateJsonKey);
      resolvedTemplateData = json ?? undefined;
    }
    if (resolvedTemplateData !== undefined) {
      resolvedTemplateData = sanitizeDesignJson(resolvedTemplateData);
    }

    return this.prisma.publicTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.thumbnail !== undefined && { thumbnail: sanitizeNullableString(dto.thumbnail) }),
        ...(dto.thumbnailSmall !== undefined && { thumbnailSmall: sanitizeNullableString(dto.thumbnailSmall) }),
        ...(resolvedTemplateData !== undefined && { templateData: resolvedTemplateData }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        updatedBy,
      },
    });
  }

  async deleteTemplate(id: string) {
    const template = await this.getTemplateById(id);

    await this.prisma.publicTemplate.delete({
      where: { id },
    });

    return { success: true };
  }

  private async readSecondaryCategoriesSetting(): Promise<string[]> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: TEMPLATE_CATEGORIES_KEY },
    });
    if (setting?.value) {
      try {
        const list = JSON.parse(setting.value);
        if (Array.isArray(list)) {
          return list
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean)
            .filter((item) => !isTemplateParentCategory(item));
        }
      } catch {
        // ignore
      }
    }

    const categories = await this.prisma.publicTemplate.findMany({
      select: { category: true },
      distinct: ['category'],
    });
    return categories
      .map((item) => item.category)
      .filter((item): item is string => Boolean(item))
      .filter((item) => !isTemplateParentCategory(item));
  }

  private async persistSecondaryCategories(list: string[]): Promise<string[]> {
    const normalized = sortPublicTemplateCategories(
      Array.from(
        new Set(
          list
            .map((item) => item?.trim())
            .filter(Boolean)
            .filter((item) => !isTemplateParentCategory(item)),
        ),
      ),
    );
    await this.prisma.systemSetting.upsert({
      where: { key: TEMPLATE_CATEGORIES_KEY },
      create: {
        key: TEMPLATE_CATEGORIES_KEY,
        value: JSON.stringify(normalized),
        description: '模板二级分类',
      },
      update: {
        value: JSON.stringify(normalized),
      },
    });
    return normalized;
  }

  private async persistCategoryParentGroups(
    groups: Record<TemplateParentCategory, string[]>,
  ): Promise<Record<TemplateParentCategory, string[]>> {
    const normalized = normalizeCategoryParentGroups(groups);
    await this.prisma.systemSetting.upsert({
      where: { key: TEMPLATE_CATEGORY_PARENT_GROUPS_KEY },
      create: {
        key: TEMPLATE_CATEGORY_PARENT_GROUPS_KEY,
        value: JSON.stringify(normalized),
        description: '模板一级/二级分类映射',
      },
      update: {
        value: JSON.stringify(normalized),
      },
    });
    await this.persistSecondaryCategories(flattenSecondaryCategories(normalized));
    return normalized;
  }

  async getCategoryParentGroups(): Promise<Record<TemplateParentCategory, string[]>> {
    const secondary = await this.readSecondaryCategoriesSetting();

    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: TEMPLATE_CATEGORY_PARENT_GROUPS_KEY },
    });

    let allSecondary = [...secondary];
    if (setting?.value) {
      try {
        const parsed = normalizeCategoryParentGroups(JSON.parse(setting.value));
        allSecondary = Array.from(
          new Set([...allSecondary, ...flattenSecondaryCategories(parsed)]),
        );
      } catch {
        // ignore
      }
    }

    const reconciled = reconcileCategoryParentGroups(allSecondary);

    if (setting?.value) {
      try {
        const stored = normalizeCategoryParentGroups(JSON.parse(setting.value));
        const storedFlat = sortPublicTemplateCategories(flattenSecondaryCategories(stored));
        const reconciledFlat = sortPublicTemplateCategories(flattenSecondaryCategories(reconciled));
        const sameGroups =
          sortPublicTemplateCategories(stored.建筑).join('\0') ===
            sortPublicTemplateCategories(reconciled.建筑).join('\0') &&
          sortPublicTemplateCategories(stored.其他).join('\0') ===
            sortPublicTemplateCategories(reconciled.其他).join('\0') &&
          storedFlat.join('\0') === reconciledFlat.join('\0');
        if (sameGroups) {
          return stored;
        }
      } catch {
        // fall through to persist reconciled
      }
    }

    if (reconciled.建筑.length || reconciled.其他.length) {
      return this.persistCategoryParentGroups(reconciled);
    }

    const defaults = buildDefaultCategoryParentGroups(secondary);
    return this.persistCategoryParentGroups(defaults);
  }

  async addTemplateCategory(category: string, parentCategory: TemplateParentCategory) {
    const trimmed = category?.trim();
    if (!trimmed) {
      throw new Error('分类不能为空');
    }
    if (isTemplateParentCategory(trimmed)) {
      throw new Error('二级分类名称不能与一级分类重名');
    }
    if (parentCategory === '建筑' && !isArchitectureSecondaryCategory(trimmed)) {
      throw new Error('仅「建筑设计」「空间设计」可归属建筑一级分类');
    }

    const groups = await this.getCategoryParentGroups();
    for (const parent of TEMPLATE_PARENT_CATEGORIES) {
      groups[parent] = groups[parent].filter((item) => item !== trimmed);
    }
    groups[parentCategory] = sortPublicTemplateCategories([
      ...groups[parentCategory],
      trimmed,
    ]);
    return this.persistCategoryParentGroups(groups);
  }

  async deleteTemplateCategory(category: string) {
    const trimmed = category?.trim();
    if (!trimmed) {
      throw new Error('分类不能为空');
    }
    if (trimmed === '其他') {
      throw new Error('"其他"分类不能删除');
    }

    const groups = await this.getCategoryParentGroups();
    for (const parent of TEMPLATE_PARENT_CATEGORIES) {
      groups[parent] = groups[parent].filter((item) => item !== trimmed);
    }
    return this.persistCategoryParentGroups(groups);
  }

  async getTemplateCategories(parentCategory?: string) {
    const groups = await this.getCategoryParentGroups();
    if (parentCategory && isTemplateParentCategory(parentCategory)) {
      return sortPublicTemplateCategories(groups[parentCategory]);
    }
    return sortPublicTemplateCategories(flattenSecondaryCategories(groups));
  }

  async getActiveTemplatesForFrontend(parentCategory?: string) {
    const where: { isActive: boolean; category?: { in: string[] } } = { isActive: true };
    if (parentCategory && isTemplateParentCategory(parentCategory)) {
      const groups = await this.getCategoryParentGroups();
      const secondary = getSecondaryCategoriesForParent(groups, parentCategory) ?? [];
      if (secondary.length === 0) {
        return [];
      }
      where.category = { in: secondary };
    }

    const templates = await this.prisma.publicTemplate.findMany({
      where,
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        tags: true,
        thumbnail: true,
        thumbnailSmall: true,
        createdAt: true,
      },
    });

    templates.sort((a, b) => {
      const rankDiff =
        getPublicTemplateCategoryRank(a.category) - getPublicTemplateCategoryRank(b.category);
      if (rankDiff !== 0) return rankDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      category: template.category,
      description: template.description,
      tags: template.tags,
      thumbnail: template.thumbnail,
      thumbnailSmall: template.thumbnailSmall,
    }));
  }
}
