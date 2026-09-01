import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'crypto';

export const CHAT_PRESET_PROMPTS_SETTING_KEY = 'chat_preset_prompts';

export type ChatPresetPromptItem = {
  id: string;
  category: string;
  title: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
};

export type ChatPresetPromptsData = {
  categories: string[];
  items: ChatPresetPromptItem[];
};

const DEFAULT_CATEGORIES = [
  'cad_总平_鸟瞰转化',
  '室内专项',
  '展板设计',
  '建筑_规划分析图',
  '建筑相关',
  '景观相关',
];

const DEFAULT_TITLES: Array<{ category: string; title: string }> = [
  { category: '建筑相关', title: '建筑外观概念' },
  { category: '室内专项', title: '室内氛围渲染' },
  { category: '建筑相关', title: '材质细节特写' },
  { category: 'cad_总平_鸟瞰转化', title: '总平面鸟瞰' },
  { category: '建筑_规划分析图', title: '体块分析图' },
  { category: '建筑_规划分析图', title: '区域规划图' },
  { category: '建筑_规划分析图', title: '建筑功能分析图' },
  { category: '建筑_规划分析图', title: '智慧城市分析图' },
  { category: '建筑_规划分析图', title: '透视分析图' },
  { category: '建筑_规划分析图', title: '道路交通分析图' },
  { category: '展板设计', title: '展板排版-竞赛风' },
  { category: '景观相关', title: '景观节点透视' },
];

/** 仅供后台「填充示例」使用，不会在公开接口自动写入 */
export function buildPresetPromptExamples(): ChatPresetPromptsData {
  return {
    categories: [...DEFAULT_CATEGORIES],
    items: DEFAULT_TITLES.map((row, index) => ({
      id: randomUUID(),
      category: row.category,
      title: row.title,
      content: row.title,
      sortOrder: index,
      isActive: true,
    })),
  };
}

@Injectable()
export class PresetPromptService {
  private readonly logger = new Logger(PresetPromptService.name);

  constructor(private readonly prisma: PrismaService) {}

  private buildDefaultData(): ChatPresetPromptsData {
    return {
      categories: [],
      items: [],
    };
  }

  private normalizeData(raw: unknown): ChatPresetPromptsData {
    if (!raw || typeof raw !== 'object') {
      return this.buildDefaultData();
    }
    const source = raw as Partial<ChatPresetPromptsData>;
    const categories = Array.isArray(source.categories)
      ? source.categories
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      : [];
    const items = Array.isArray(source.items)
      ? source.items
          .map((item, index) => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Partial<ChatPresetPromptItem>;
            const title = typeof row.title === 'string' ? row.title.trim() : '';
            if (!title) return null;
            const content =
              typeof row.content === 'string' && row.content.trim()
                ? row.content.trim()
                : title;
            const category =
              typeof row.category === 'string' ? row.category.trim() : '';
            return {
              id:
                typeof row.id === 'string' && row.id.trim()
                  ? row.id.trim()
                  : randomUUID(),
              category,
              title,
              content,
              sortOrder:
                typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder)
                  ? row.sortOrder
                  : index,
              isActive: row.isActive !== false,
            } satisfies ChatPresetPromptItem;
          })
          .filter(Boolean) as ChatPresetPromptItem[]
      : [];

    const categorySet = new Set(categories);
    for (const item of items) {
      if (item.category) categorySet.add(item.category);
    }

    return {
      categories: Array.from(categorySet),
      items: items.sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }

  async getData(options?: { ensureDefault?: boolean }): Promise<ChatPresetPromptsData> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: CHAT_PRESET_PROMPTS_SETTING_KEY },
    });

    if (!setting?.value) {
      const defaults = this.buildDefaultData();
      if (options?.ensureDefault) {
        await this.saveData(defaults);
      }
      return defaults;
    }

    try {
      const parsed = JSON.parse(setting.value);
      return this.normalizeData(parsed);
    } catch (error) {
      this.logger.warn(
        `Failed to parse ${CHAT_PRESET_PROMPTS_SETTING_KEY}, fallback to defaults`,
      );
      return this.buildDefaultData();
    }
  }

  async getPublicData(): Promise<{
    categories: string[];
    items: Array<Pick<ChatPresetPromptItem, 'id' | 'category' | 'title' | 'content' | 'sortOrder'>>;
  }> {
    const data = await this.getData({ ensureDefault: false });
    const activeItems = data.items.filter((item) => item.isActive);
    return {
      categories: data.categories,
      items: activeItems.map(({ id, category, title, content, sortOrder }) => ({
        id,
        category,
        title,
        content,
        sortOrder,
      })),
    };
  }

  async saveData(
    data: ChatPresetPromptsData,
    updatedBy?: string,
  ): Promise<ChatPresetPromptsData> {
    const normalized = this.normalizeData(data);
    await this.prisma.systemSetting.upsert({
      where: { key: CHAT_PRESET_PROMPTS_SETTING_KEY },
      create: {
        key: CHAT_PRESET_PROMPTS_SETTING_KEY,
        value: JSON.stringify(normalized),
        description: 'AI 对话框预设提示词（分类 + 条目）',
        updatedBy,
      },
      update: {
        value: JSON.stringify(normalized),
        description: 'AI 对话框预设提示词（分类 + 条目）',
        updatedBy,
      },
    });
    return normalized;
  }
}
