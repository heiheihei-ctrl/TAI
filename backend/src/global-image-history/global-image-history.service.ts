// Service for CRUD operations on global image history records.
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGlobalImageHistoryDto, QueryGlobalImageHistoryDto } from './dto/global-image-history.dto';

const SOURCE_TYPE_SEARCH_ALIASES: Record<string, string[]> = {
  generate: ['generate', '图片生成', 'image generate'],
  generatePro: ['generatepro', '图片生成pro', 'image generate pro'],
  generatePro4: ['generatepro4', '图片生成pro4', 'image generate pro4'],
  midjourney: ['midjourney'],
  '3d': ['3d', '3d生成', '3d模型', '3d generate', '3d category'],
  camera: ['camera', '相机', 'camera category'],
  image: ['image', '图片', '图片类', '图像', 'image category'],
  imagePro: ['imagepro', '图片pro', 'image pro'],
  video: ['video', '视频', '视频类', 'video category'],
  klingVideo: ['klingvideo', 'kling', 'kling视频', 'kling video'],
  kling26Video: ['kling26video', 'kling2.6', 'kling2.6视频', 'kling 2.6 video'],
  kling30Video: ['kling30video', 'kling3.0', 'kling3.0视频', 'kling 3.0 video'],
  klingO1Video: [
    'klingo1video',
    'klingo3video',
    'klingo1',
    'klingo3',
    'klingo3视频',
    'kling o3 video',
    'kling 3.0 omni',
    'kling 3.0-omni',
  ],
  klingO3Video: [
    'klingo3video',
    'klingo3',
    'klingo3视频',
    'kling o3 video',
    'kling 3.0 omni',
    'kling 3.0-omni',
  ],
  viduVideo: ['viduvideo', 'vidu', 'vidu视频', 'vidu video'],
  viduQ3: ['viduq3', 'vidu q3', 'viduq3视频', 'vidu q3 video'],
  doubaoVideo: ['doubaovideo', 'doubao', '豆包视频', 'doubao video'],
  seedance20Video: [
    'seedance20video',
    'seedance2.0',
    'seedance2.0视频',
    'seedance 2.0 video',
  ],
  wan26: ['wan26', 'wan2.6', 'wan2.6视频', 'wan 2.6 video'],
  wan27Video: ['wan27video', 'wan27', 'wan2.7', 'wan2.7视频', 'wan 2.7 video'],
  wan2R2V: ['wan2r2v', 'wan参考视频', 'wan reference video', 'wan r2v'],
  happyhorseR2V: ['happyhorser2v', 'happyhorse', '快乐马视频', 'happyhorse video'],
  sora2Video: ['sora2video', 'sora2', 'sora2视频', 'sora 2 video'],
  tencentSpeech: ['tencentspeech', 'speech', '语音', '腾讯语音', '腾讯语音合成', 'tencent speech', 'speech category'],
};

const normalizeSearchKeyword = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\s._-]+/g, '')
    .trim();

const getMatchedSourceTypes = (keyword: string): string[] => {
  const normalizedKeyword = normalizeSearchKeyword(keyword);
  if (!normalizedKeyword) return [];

  return Object.entries(SOURCE_TYPE_SEARCH_ALIASES)
    .filter(([sourceType, aliases]) => {
      const normalizedSourceType = normalizeSearchKeyword(sourceType);
      if (
        normalizedSourceType.includes(normalizedKeyword) ||
        normalizedKeyword.includes(normalizedSourceType)
      ) {
        return true;
      }

      return aliases.some((alias) => {
        const normalizedAlias = normalizeSearchKeyword(alias);
        return (
          normalizedAlias.includes(normalizedKeyword) ||
          normalizedKeyword.includes(normalizedAlias)
        );
      });
    })
    .map(([sourceType]) => sourceType);
};

const pickNonEmptyString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const VIDEO_SOURCE_TYPES = new Set([
  'video',
  'klingVideo',
  'kling26Video',
  'kling30Video',
  'klingO1Video',
  'klingO3Video',
  'viduVideo',
  'viduQ3',
  'doubaoVideo',
  'seedance20Video',
  'wan26',
  'wan27Video',
  'wan2R2V',
  'happyhorseR2V',
  'sora2Video',
  'tencentSpeech',
]);

const HISTORY_CATEGORY_SOURCE_TYPES: Record<string, string[]> = {
  image: ['generate', 'generatePro', 'generatePro4', 'midjourney', 'image', 'imagePro'],
  video: [
    'video',
    'klingVideo',
    'kling26Video',
    'kling30Video',
    'klingO1Video',
    'klingO3Video',
    'viduVideo',
    'viduQ3',
    'doubaoVideo',
    'seedance20Video',
    'wan26',
    'wan27Video',
    'wan2R2V',
    'happyhorseR2V',
    'sora2Video',
  ],
  camera: ['camera'],
  '3d': ['3d'],
  speech: ['tencentSpeech'],
};

const looksLikeVideoUrl = (value?: string): boolean => {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  return /(\.mp4|\.mov|\.avi|\.webm|\.m4v|\.m3u8)(\?|#|$)/i.test(trimmed);
};

const looksLikeImageUrl = (value?: string): boolean => {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  return /(\.png|\.jpg|\.jpeg|\.webp|\.gif|\.bmp|\.avif)(\?|#|$)/i.test(trimmed);
};

@Injectable()
export class GlobalImageHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private mapHistoryItem<T extends Record<string, any>>(item: T) {
    const metadata = isRecord(item.metadata) ? item.metadata : {};
    const sourceType = pickNonEmptyString(item.sourceType) || '';
    const explicitMediaType = pickNonEmptyString(metadata.mediaType, metadata.type);
    const candidateVideoUrl = pickNonEmptyString(
      metadata.mediaUrl,
      metadata.videoUrl,
      item.imageUrl,
    );
    const mediaType =
      explicitMediaType === 'video' ||
      VIDEO_SOURCE_TYPES.has(sourceType) ||
      looksLikeVideoUrl(candidateVideoUrl)
        ? 'video'
        : 'image';
    const mediaUrl = pickNonEmptyString(
      metadata.mediaUrl,
      metadata.videoUrl,
      mediaType === 'video' ? item.imageUrl : undefined,
      item.imageUrl,
    );
    const thumbnailCandidate = pickNonEmptyString(
      metadata.thumbnailUrl,
      metadata.thumbnail,
      metadata.poster,
      item.imageUrl,
    );
    const thumbnailUrl =
      mediaType === 'video'
        ? thumbnailCandidate && thumbnailCandidate !== mediaUrl && looksLikeImageUrl(thumbnailCandidate)
          ? thumbnailCandidate
          : undefined
        : thumbnailCandidate;

    return {
      ...item,
      metadata,
      mediaType,
      mediaUrl,
      thumbnailUrl,
      imageUrl: item.imageUrl,
    };
  }

  async create(userId: string, dto: CreateGlobalImageHistoryDto) {
    const mediaType = dto.mediaType === 'video' ? 'video' : 'image';
    const mediaUrl = pickNonEmptyString(dto.mediaUrl, dto.imageUrl);
    const thumbnailUrl = pickNonEmptyString(dto.thumbnailUrl, dto.imageUrl, mediaUrl);
    const displayUrl = mediaType === 'video' ? thumbnailUrl || mediaUrl : dto.imageUrl || mediaUrl;

    if (!displayUrl || !mediaUrl) {
      throw new BadRequestException('imageUrl/mediaUrl 不能为空');
    }

    const nextMetadata = {
      ...(isRecord(dto.metadata) ? dto.metadata : {}),
      mediaType,
      mediaUrl,
      thumbnailUrl,
    };

    const created = await this.prisma.globalImageHistory.create({
      data: {
        userId,
        imageUrl: displayUrl,
        prompt: dto.prompt,
        sourceType: dto.sourceType,
        sourceProjectId: dto.sourceProjectId,
        sourceProjectName: dto.sourceProjectName,
        metadata: nextMetadata,
      },
    });

    return this.mapHistoryItem(created);
  }

  async list(userId: string, query: QueryGlobalImageHistoryDto) {
    const { limit = 20, cursor, sourceType, sourceProjectId, search, page } =
      query;

    const where: any = { userId };
    if (sourceType) {
      const categorySourceTypes = HISTORY_CATEGORY_SOURCE_TYPES[sourceType];
      where.sourceType = categorySourceTypes ? { in: categorySourceTypes } : sourceType;
    }
    if (sourceProjectId) {
      where.sourceProjectId = sourceProjectId;
    }
    if (typeof search === 'string' && search.trim()) {
      const keyword = search.trim();
      const matchedSourceTypes = getMatchedSourceTypes(keyword);
      where.OR = [
        {
          prompt: {
            contains: keyword,
            mode: 'insensitive',
          },
        },
        {
          sourceProjectName: {
            contains: keyword,
            mode: 'insensitive',
          },
        },
        {
          sourceType: {
            contains: keyword,
            mode: 'insensitive',
          },
        },
        ...(matchedSourceTypes.length > 0
          ? [
              {
                sourceType: {
                  in: matchedSourceTypes,
                },
              },
            ]
          : []),
      ];
    }

    if (typeof page === 'number' && Number.isFinite(page) && page >= 1) {
      const totalCount = await this.prisma.globalImageHistory.count({ where });
      const totalPages =
        totalCount > 0 ? Math.ceil(totalCount / limit) : 1;
      const safePage = Math.min(Math.max(1, Math.trunc(page)), totalPages);
      const skip = (safePage - 1) * limit;

      const items = await this.prisma.globalImageHistory.findMany({
        where,
        take: limit,
        skip,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      return {
        items: items.map((item) => this.mapHistoryItem(item)),
        nextCursor: undefined,
        hasMore: safePage < totalPages,
        totalCount,
        totalPages,
        page: safePage,
      };
    }

    const items = await this.prisma.globalImageHistory.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    let nextCursor: string | undefined;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem?.id;
    }

    return {
      items: items.map((item) => this.mapHistoryItem(item)),
      nextCursor,
      hasMore: !!nextCursor,
    };
  }

  async getOne(userId: string, id: string) {
    const item = await this.prisma.globalImageHistory.findFirst({
      where: { id, userId },
    });
    return item ? this.mapHistoryItem(item) : null;
  }

  async delete(userId: string, id: string) {
    const item = await this.prisma.globalImageHistory.findFirst({
      where: { id, userId },
    });
    if (!item) {
      return { success: false, message: '记录不存在' };
    }
    await this.prisma.globalImageHistory.delete({ where: { id } });
    return { success: true };
  }

  async getCount(userId: string) {
    return this.prisma.globalImageHistory.count({ where: { userId } });
  }
}
