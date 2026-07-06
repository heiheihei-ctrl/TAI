/**
 * 批量解冻火山引擎 TOS 归档/冷归档对象。
 *
 * 用法（在 backend 目录）:
 *   npx ts-node scripts/restore-tos-archived-objects.ts
 *   npx ts-node scripts/restore-tos-archived-objects.ts --prefix=ai/videos
 *   npx ts-node scripts/restore-tos-archived-objects.ts --key=ai/videos/doubao/xxx.mp4
 *   npx ts-node scripts/restore-tos-archived-objects.ts --dry-run
 *
 * 环境变量（与后端 OSS 一致）:
 *   OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_ENDPOINT, OSS_REGION
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import {
  HeadObjectCommand,
  ListObjectsV2Command,
  RestoreObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

loadEnv({ path: resolve(__dirname, '../.env') });

type RestoreTier = 'Standard' | 'Expedited' | 'Bulk';

const ARCHIVE_STORAGE_CLASSES = new Set([
  'ARCHIVE',
  'GLACIER',
  'DEEP_ARCHIVE',
  'COLD_ARCHIVE',
  'DEEP_COLD_ARCHIVE',
]);

interface CliOptions {
  prefix: string;
  key: string;
  dryRun: boolean;
  days: number;
  tier: RestoreTier;
  concurrency: number;
  /** 跳过 HeadObject，直接尝试 Restore（全量更快） */
  tryRestore: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    prefix: '',
    key: '',
    dryRun: false,
    days: 7,
    tier: 'Standard',
    concurrency: 8,
    tryRestore: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--try-restore') options.tryRestore = true;
    else if (arg.startsWith('--prefix=')) options.prefix = arg.slice('--prefix='.length).replace(/^\/+/, '');
    else if (arg.startsWith('--key=')) options.key = arg.slice('--key='.length).replace(/^\/+/, '');
    else if (arg.startsWith('--days=')) options.days = Math.max(1, Number(arg.slice('--days='.length)) || 7);
    else if (arg.startsWith('--tier=')) {
      const tier = arg.slice('--tier='.length) as RestoreTier;
      if (tier === 'Standard' || tier === 'Expedited' || tier === 'Bulk') {
        options.tier = tier;
      }
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = Math.max(1, Math.min(32, Number(arg.slice('--concurrency='.length)) || 8));
    }
  }

  return options;
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = String(endpoint || '').trim();
  if (!trimmed) return 'https://tos-s3-cn-guangzhou.volces.com';
  const withProtocol = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    const hostname = parsed.hostname.toLowerCase();
    if (
      (hostname.endsWith('.volces.com') || hostname.endsWith('.ivolces.com')) &&
      hostname.startsWith('tos-') &&
      !hostname.startsWith('tos-s3-')
    ) {
      parsed.hostname = hostname.replace(/^tos-/, 'tos-s3-');
    }
    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return withProtocol.replace(/\/+$/, '');
  }
}

function createClient() {
  const region = process.env.OSS_REGION || 'cn-guangzhou';
  const bucket = process.env.OSS_BUCKET || '';
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID || '';
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET || '';
  const endpoint = normalizeEndpoint(process.env.OSS_ENDPOINT || '');

  if (!bucket || !accessKeyId || !accessKeySecret) {
    throw new Error('缺少 OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET，请检查 backend/.env');
  }

  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey: accessKeySecret },
    forcePathStyle: false,
  });

  return { client, bucket };
}

function parseRestoreHeader(restore?: string): {
  ongoing: boolean;
  expiryDate?: Date;
} {
  if (!restore) return { ongoing: false };
  const ongoing = /ongoing-request="true"/i.test(restore);
  const expiryMatch = restore.match(/expiry-date="([^"]+)"/i);
  const expiryDate = expiryMatch?.[1] ? new Date(expiryMatch[1]) : undefined;
  return { ongoing, expiryDate };
}

function needsRestore(storageClass?: string, restoreHeader?: string): {
  required: boolean;
  reason: string;
} {
  const cls = String(storageClass || 'STANDARD').toUpperCase();
  if (!ARCHIVE_STORAGE_CLASSES.has(cls)) {
    return { required: false, reason: `标准/低频存储 (${cls})` };
  }

  const restore = parseRestoreHeader(restoreHeader);
  if (restore.ongoing) {
    return { required: false, reason: '解冻进行中' };
  }
  if (restore.expiryDate && restore.expiryDate.getTime() > Date.now()) {
    return { required: false, reason: `已解冻至 ${restore.expiryDate.toISOString()}` };
  }

  return { required: true, reason: `归档类型 ${cls}` };
}

async function listObjectKeys(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );

    for (const item of res.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function headObject(
  client: S3Client,
  bucket: string,
  key: string,
) {
  const res = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  const restoreHeader =
    (res.Restore as string | undefined) ||
    (res.Metadata?.['x-amz-restore'] as string | undefined);

  return {
    storageClass: res.StorageClass,
    restoreHeader,
    contentLength: res.ContentLength ?? 0,
  };
}

async function restoreObject(
  client: S3Client,
  bucket: string,
  key: string,
  days: number,
  tier: RestoreTier,
) {
  await client.send(
    new RestoreObjectCommand({
      Bucket: bucket,
      Key: key,
      RestoreRequest: {
        Days: days,
        GlacierJobParameters: { Tier: tier },
      },
    }),
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { client, bucket } = createClient();

  console.log('[restore-tos] bucket:', bucket);
  console.log('[restore-tos] options:', options);

  const keys = options.key
    ? [options.key]
    : await listObjectKeys(client, bucket, options.prefix);

  if (keys.length === 0) {
    console.log('[restore-tos] 未找到对象');
    return;
  }

  console.log(`[restore-tos] 共 ${keys.length} 个对象待检查`);

  let restored = 0;
  let skipped = 0;
  let failed = 0;

  await mapWithConcurrency(keys, options.concurrency, async (key) => {
    try {
      if (!options.tryRestore) {
        const meta = await headObject(client, bucket, key);
        const decision = needsRestore(meta.storageClass, meta.restoreHeader);

        if (!decision.required) {
          skipped += 1;
          console.log(`[skip] ${key} — ${decision.reason}`);
          return;
        }

        if (options.dryRun) {
          restored += 1;
          console.log(`[dry-run restore] ${key} — ${decision.reason}`);
          return;
        }

        await restoreObject(client, bucket, key, options.days, options.tier);
        restored += 1;
        console.log(`[restore] ${key} — 已提交解冻 (${options.tier}, ${options.days} 天)`);
        return;
      }

      // 快速模式：直接提交解冻，非归档对象会报错后跳过
      if (options.dryRun) {
        restored += 1;
        console.log(`[dry-run try-restore] ${key}`);
        return;
      }

      await restoreObject(client, bucket, key, options.days, options.tier);
      restored += 1;
      console.log(`[restore] ${key} — 已提交解冻`);
    } catch (error: any) {
      const code = String(error?.name || error?.Code || error?.code || '');
      const message = String(error?.message || error);

      if (
        options.tryRestore &&
        (code === 'InvalidObjectState' ||
          code === 'RestoreAlreadyInProgress' ||
          message.includes('already in progress') ||
          message.includes('not valid for the object'))
      ) {
        skipped += 1;
        console.log(`[skip] ${key} — ${code || message}`);
        return;
      }

      failed += 1;
      console.error(`[fail] ${key} — ${code}: ${message}`);
    }
  });

  console.log('\n[restore-tos] 完成');
  console.log(`  提交解冻: ${restored}`);
  console.log(`  跳过: ${skipped}`);
  console.log(`  失败: ${failed}`);
  if (!options.dryRun && restored > 0) {
    console.log('\n说明: 归档对象解冻需要等待数分钟到数小时，完成后在解冻有效期内可正常访问。');
    console.log('可用 HeadObject 查看 Restore 头: ongoing-request="false" 且带 expiry-date 即表示可读。');
  }
}

void main().catch((error) => {
  console.error('[restore-tos] 脚本异常:', error);
  process.exit(1);
});
