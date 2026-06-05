import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VIDEO_SOURCE_TYPES = new Set([
  'video',
  'klingVideo',
  'kling26Video',
  'kling30Video',
  'klingO1Video',
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

const pickNonEmptyString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

type Args = {
  write: boolean;
  limit?: number;
};

const parseArgs = (): Args => {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const parsedLimit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
  return {
    write,
    limit: Number.isFinite(parsedLimit) && parsedLimit! > 0 ? Math.trunc(parsedLimit!) : undefined,
  };
};

async function main() {
  const { write, limit } = parseArgs();
  const batchSize = 100;
  let cursor: string | undefined;
  let scanned = 0;
  let matched = 0;
  let updated = 0;

  for (;;) {
    const batch = await prisma.globalImageHistory.findMany({
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        imageUrl: true,
        sourceType: true,
        metadata: true,
      },
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      scanned += 1;
      const metadata: JsonRecord = isRecord(row.metadata) ? { ...row.metadata } : {};
      const explicitMediaType = pickNonEmptyString(metadata.mediaType, metadata.type);
      const existingMediaUrl = pickNonEmptyString(metadata.mediaUrl, metadata.videoUrl);
      const imageUrl = pickNonEmptyString(row.imageUrl);
      const inferredIsVideo =
        explicitMediaType === 'video' ||
        VIDEO_SOURCE_TYPES.has(row.sourceType) ||
        looksLikeVideoUrl(existingMediaUrl) ||
        looksLikeVideoUrl(imageUrl);

      if (!inferredIsVideo) {
        if (limit && scanned >= limit) break;
        continue;
      }

      matched += 1;
      const mediaUrl = existingMediaUrl || imageUrl;
      if (!mediaUrl) {
        if (limit && scanned >= limit) break;
        continue;
      }

      const thumbnailCandidate = pickNonEmptyString(
        metadata.thumbnailUrl,
        metadata.thumbnail,
        metadata.poster,
      );
      const thumbnailUrl =
        thumbnailCandidate &&
        thumbnailCandidate !== mediaUrl &&
        looksLikeImageUrl(thumbnailCandidate)
          ? thumbnailCandidate
          : undefined;
      const displayUrl = thumbnailUrl || mediaUrl;

      const nextMetadata = {
        ...metadata,
        mediaType: 'video',
        mediaUrl,
        thumbnailUrl,
      };

      const metadataChanged = JSON.stringify(metadata) !== JSON.stringify(nextMetadata);
      const imageUrlChanged = row.imageUrl !== displayUrl;
      if (!metadataChanged && !imageUrlChanged) {
        if (limit && scanned >= limit) break;
        continue;
      }

      if (write) {
        await prisma.globalImageHistory.update({
          where: { id: row.id },
          data: {
            imageUrl: displayUrl,
            metadata: nextMetadata as any,
          },
        });
      }
      updated += 1;

      if (limit && scanned >= limit) break;
    }

    cursor = batch[batch.length - 1]?.id;
    if (limit && scanned >= limit) break;
  }

  // eslint-disable-next-line no-console
  console.log('[backfill-global-video-history] Done', {
    mode: write ? 'write' : 'dry-run',
    scanned,
    matched,
    updated,
  });
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[backfill-global-video-history] Failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
