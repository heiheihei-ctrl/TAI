/**
 * Export platform AI models catalog + ApiUsageRecord totals to Excel (CSV fallback).
 *
 * Usage: cd backend && npx ts-node scripts/export-platform-models-usage.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ModelCatalogRow = {
  category: string;
  productName: string;
  modelId: string;
  company: string;
  useCase: string;
  nodeEntry: string;
  serviceTypes: string[];
  note: string;
};

const CATALOG: ModelCatalogRow[] = [
  { category: 'LLM/文本', productName: 'Gemini 2.5 Flash', modelId: 'gemini-2.5-flash', company: 'Google', useCase: 'Fast档文本对话', nodeEntry: 'AI对话框', serviceTypes: ['gemini-text', 'gemini-tool-selection'], note: '' },
  { category: 'LLM/文本', productName: 'Gemini 3 Flash Preview', modelId: 'gemini-3-flash-preview', company: 'Google', useCase: 'Pro档文本', nodeEntry: 'AI对话框', serviceTypes: ['gemini-text'], note: '' },
  { category: 'LLM/文本', productName: 'Gemini 3.1 Pro', modelId: 'gemini-3.1-pro', company: 'Google', useCase: 'Ultra档文本', nodeEntry: 'AI对话框', serviceTypes: ['gemini-text', 'gemini-prompt-optimize'], note: '' },
  { category: 'LLM/文本', productName: 'Gemini 提示词优化', modelId: 'gemini-prompt-optimize', company: 'Google', useCase: '提示词优化', nodeEntry: '提示词优化节点', serviceTypes: ['gemini-prompt-optimize'], note: '' },
  { category: 'LLM/文本', productName: 'Gemini Paper.js', modelId: 'gemini-paperjs', company: 'Google', useCase: '矢量代码生成', nodeEntry: '画布', serviceTypes: ['gemini-paperjs'], note: '' },
  { category: 'LLM/文本', productName: 'Gemini 图像转矢量', modelId: 'gemini-img2vector', company: 'Google', useCase: '图转矢量', nodeEntry: '画布', serviceTypes: ['gemini-img2vector'], note: '' },
  { category: 'LLM/文本', productName: 'Gemini 视频分析', modelId: 'gemini-3.0-flash', company: 'Google', useCase: '视频反推提示词', nodeEntry: 'Video Analysis', serviceTypes: ['gemini-video-analyze'], note: '' },

  { category: '图像生成', productName: 'Nano Banana Fast', modelId: 'gemini-2.5-flash-image-preview', company: 'Google', useCase: '文生图/编辑/融合', nodeEntry: 'Generate节点', serviceTypes: ['gemini-2.5-image', 'gemini-2.5-image-edit', 'gemini-2.5-image-blend', 'gemini-2.5-image-analyze'], note: '' },
  { category: '图像生成', productName: 'Nano Banana Pro', modelId: 'gemini-3-pro-image-preview', company: 'Google', useCase: '文生图/编辑/融合', nodeEntry: 'Generate节点', serviceTypes: ['gemini-3-pro-image', 'gemini-image-edit', 'gemini-image-blend', 'gemini-image-analyze'], note: '' },
  { category: '图像生成', productName: 'Nano Banana 2', modelId: 'gemini-3.1-flash-image-preview', company: 'Google', useCase: '文生图/编辑/融合', nodeEntry: 'Nano2节点', serviceTypes: ['gemini-3.1-image', 'gemini-3.1-image-edit', 'gemini-3.1-image-blend', 'gemini-3.1-image-analyze'], note: '' },
  { category: '图像生成', productName: 'GPT-Image-2', modelId: 'gpt-image-2', company: 'OpenAI', useCase: '文生图/图生图', nodeEntry: 'GPT-Image-2节点', serviceTypes: ['gpt-image-2'], note: '' },
  { category: '图像生成', productName: 'Seedream 5.0', modelId: 'doubao-seedream-5-0-260128', company: '字节跳动(火山引擎)', useCase: '文生图', nodeEntry: 'Seedream5节点', serviceTypes: ['doubao-seedream-5-0-260128'], note: '' },
  { category: '图像生成', productName: 'Midjourney V7', modelId: 'midjourney-v7', company: 'Midjourney', useCase: '文生图', nodeEntry: 'Midjourney节点', serviceTypes: ['midjourney-imagine', 'midjourney-variation', 'midjourney-upscale'], note: '' },
  { category: '图像生成', productName: 'Midjourney Niji 7', modelId: 'midjourney-niji-7', company: 'Midjourney', useCase: '动漫风生图', nodeEntry: 'Niji7节点', serviceTypes: ['midjourney-imagine'], note: '' },

  { category: '图像处理', productName: '背景移除', modelId: 'background-removal', company: 'remove.bg/IMG.LY', useCase: '智能抠图', nodeEntry: '画布', serviceTypes: ['background-removal'], note: '' },
  { category: '图像处理', productName: '图像扩展', modelId: 'expand-image', company: 'Google', useCase: '扩图', nodeEntry: '画布', serviceTypes: ['expand-image'], note: '' },

  { category: '视频生成', productName: 'Kling 2.6', modelId: 'kling-v2-6', company: '可灵(快手)', useCase: '文/图生视频', nodeEntry: 'Kling2.6节点', serviceTypes: ['kling-2.6-video', 'kling-video'], note: '' },
  { category: '视频生成', productName: 'Kling 3.0', modelId: 'kling-v3-0', company: '可灵(快手)', useCase: '文/图生视频', nodeEntry: 'Kling3.0节点', serviceTypes: ['kling-3.0-video'], note: '' },
  { category: '视频生成', productName: 'Kling O3/Omni', modelId: 'kling-v3-omni', company: '可灵(快手)', useCase: 'Omni视频', nodeEntry: 'Kling O3节点', serviceTypes: ['kling-o3-video'], note: '' },
  { category: '视频生成', productName: 'Vidu Q2', modelId: 'viduq2', company: '生数科技(Vidu)', useCase: '文/图生视频', nodeEntry: 'Vidu节点', serviceTypes: ['vidu-video'], note: '' },
  { category: '视频生成', productName: 'Vidu Q3 Pro', modelId: 'viduq3-pro', company: '生数科技(Vidu)', useCase: '文/图生视频', nodeEntry: 'Vidu Q3节点', serviceTypes: ['viduq3-pro-video'], note: '' },
  { category: '视频生成', productName: 'Seedance 1.5 Pro', modelId: 'doubao-seedance-1-5-pro-251215', company: '字节跳动(火山引擎)', useCase: '视频生成', nodeEntry: 'Seedance1.5节点', serviceTypes: ['doubao-video'], note: '' },
  { category: '视频生成', productName: 'Seedance 2.0', modelId: 'doubao-seedance-2-0-260128', company: '字节跳动(火山引擎)', useCase: '视频生成', nodeEntry: 'Seedance2.0节点', serviceTypes: ['doubao-video'], note: '' },
  { category: '视频生成', productName: 'Seedance 2.0 Fast', modelId: 'doubao-seedance-2-0-fast-260128', company: '字节跳动(火山引擎)', useCase: '快速视频', nodeEntry: 'Seedance2.0节点', serviceTypes: ['doubao-video'], note: '' },
  { category: '视频生成', productName: 'Sora 2', modelId: 'sora-2', company: 'OpenAI', useCase: '文/图生视频', nodeEntry: 'Sora2节点', serviceTypes: ['sora-sd', 'sora-hd'], note: '' },
  { category: '视频生成', productName: 'Sora 2 Pro', modelId: 'sora-2-pro', company: 'OpenAI', useCase: '高清/25s视频', nodeEntry: 'Sora2节点', serviceTypes: ['sora-sd', 'sora-hd'], note: '' },
  { category: '视频生成', productName: 'Wan 2.6 T2V', modelId: 'wan2.6-t2v', company: '阿里巴巴(通义万相)', useCase: '文生视频', nodeEntry: 'Wan2.6节点', serviceTypes: ['wan26-video'], note: '' },
  { category: '视频生成', productName: 'Wan 2.6 I2V', modelId: 'wan2.6-i2v', company: '阿里巴巴(通义万相)', useCase: '图生视频', nodeEntry: 'Wan2.6节点', serviceTypes: ['wan26-video'], note: '' },
  { category: '视频生成', productName: 'Wan 2.6 R2V', modelId: 'wan2.6-r2v', company: '阿里巴巴(通义万相)', useCase: '参考视频融合', nodeEntry: 'Wan2 R2V节点', serviceTypes: ['wan26-r2v'], note: '' },
  { category: '视频生成', productName: 'Wan 2.7 I2V', modelId: 'wan2.7-i2v', company: '阿里巴巴(通义万相)', useCase: '图生视频', nodeEntry: 'Wan2.7节点', serviceTypes: ['wan27-video'], note: '' },
  { category: '视频生成', productName: 'HappyHorse 1.0 R2V', modelId: 'happyhorse-1.0-r2v', company: '阿里巴巴(DashScope定制)', useCase: '多图参考视频', nodeEntry: '快乐马节点', serviceTypes: ['happyhorse-r2v-video'], note: '' },
  { category: '视频生成', productName: 'Omni Flash Ext', modelId: 'Omni-Flash-Ext', company: 'APIMart', useCase: '文/图生视频', nodeEntry: 'Omni Flash Ext节点', serviceTypes: ['omni-flash-ext-video'], note: '' },

  { category: '视频处理', productName: '火山视频增强', modelId: 'volc-enhance-video', company: '字节跳动(火山引擎)', useCase: '视频超分', nodeEntry: '视频增强节点', serviceTypes: ['volc-enhance-video'], note: '' },
  { category: '视频处理', productName: '视频转GIF', modelId: 'ffmpeg', company: '本地处理', useCase: '转GIF', nodeEntry: '视频转GIF节点', serviceTypes: ['video-to-gif'], note: '' },

  { category: '音频', productName: 'MiniMax Speech 2.6 HD', modelId: 'speech-2.6-hd', company: 'MiniMax(稀宇科技)', useCase: 'TTS', nodeEntry: 'MiniMax语音节点', serviceTypes: ['minimax-speech'], note: '' },
  { category: '音频', productName: 'MiniMax Music 2.5+', modelId: 'music-2.5+', company: 'MiniMax(稀宇科技)', useCase: 'AI音乐', nodeEntry: 'MiniMax音乐节点', serviceTypes: ['minimax-music'], note: '' },
  { category: '音频', productName: '腾讯 AI 配音', modelId: 'tencent-speech', company: '腾讯', useCase: '视频配音', nodeEntry: '腾讯语音节点', serviceTypes: ['tencent-speech'], note: '' },

  { category: '3D', productName: '混元 3D', modelId: '3.1', company: '腾讯(混元)', useCase: '2D转3D', nodeEntry: '三维节点', serviceTypes: ['convert-2d-to-3d'], note: '' },
];

type UsageAgg = {
  model: string | null;
  serviceType: string;
  serviceName: string;
  provider: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  pendingCalls: number;
  totalCredits: number;
  userCount: number;
};

function escapeCsv(val: string | number | null | undefined): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildServiceTypeIndex(): Map<string, ModelCatalogRow> {
  const map = new Map<string, ModelCatalogRow>();
  for (const row of CATALOG) {
    for (const st of row.serviceTypes) {
      if (!map.has(st)) map.set(st, row);
    }
  }
  return map;
}

function matchCatalog(
  serviceType: string,
  model: string | null,
  serviceTypeIndex: Map<string, ModelCatalogRow>,
): ModelCatalogRow | null {
  const normalizedModel = (model || '').trim().toLowerCase();
  if (normalizedModel) {
    const byModel = CATALOG.find(
      (r) =>
        r.modelId.toLowerCase() === normalizedModel ||
        normalizedModel.includes(r.modelId.toLowerCase()) ||
        r.modelId.toLowerCase().includes(normalizedModel),
    );
    if (byModel) return byModel;
  }
  return serviceTypeIndex.get(serviceType) || null;
}

async function fetchUsage(): Promise<UsageAgg[]> {
  const rows = await prisma.apiUsageRecord.groupBy({
    by: ['model', 'serviceType', 'serviceName', 'provider', 'responseStatus'],
    _count: { _all: true },
    _sum: { creditsUsed: true },
  });

  const userRows = await prisma.apiUsageRecord.groupBy({
    by: ['model', 'serviceType', 'provider', 'userId'],
    _count: { _all: true },
  });

  const userCountMap = new Map<string, Set<string>>();
  for (const ur of userRows) {
    const key = `${ur.model || ''}|${ur.serviceType}|${ur.provider}`;
    if (!userCountMap.has(key)) userCountMap.set(key, new Set());
    userCountMap.get(key)!.add(ur.userId);
  }

  const aggMap = new Map<string, UsageAgg>();
  for (const row of rows) {
    const key = `${row.model || ''}|${row.serviceType}|${row.serviceName}|${row.provider}`;
    if (!aggMap.has(key)) {
      aggMap.set(key, {
        model: row.model,
        serviceType: row.serviceType,
        serviceName: row.serviceName,
        provider: row.provider,
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        pendingCalls: 0,
        totalCredits: 0,
        userCount: 0,
      });
    }
    const item = aggMap.get(key)!;
    const count = row._count._all;
    item.totalCalls += count;
    item.totalCredits += row._sum.creditsUsed || 0;
    if (row.responseStatus === 'success') item.successCalls += count;
    else if (row.responseStatus === 'failed') item.failedCalls += count;
    else if (row.responseStatus === 'pending') item.pendingCalls += count;
  }

  for (const item of aggMap.values()) {
    const userKey = `${item.model || ''}|${item.serviceType}|${item.provider}`;
    item.userCount = userCountMap.get(userKey)?.size || 0;
  }

  return Array.from(aggMap.values()).sort((a, b) => b.totalCalls - a.totalCalls);
}

async function main() {
  const serviceTypeIndex = buildServiceTypeIndex();
  const usage = await fetchUsage();
  const generatedAt = new Date().toISOString();

  const mergedRows: Array<Record<string, string | number>> = [];
  const seenCatalogKeys = new Set<string>();

  for (const u of usage) {
    const catalog = matchCatalog(u.serviceType, u.model, serviceTypeIndex);
    const key = catalog ? catalog.modelId : `${u.serviceType}|${u.model || ''}`;
    seenCatalogKeys.add(key);
    mergedRows.push({
      类别: catalog?.category || '其他(仅用量记录)',
      产品名称: catalog?.productName || u.serviceName,
      模型ID: catalog?.modelId || u.model || u.serviceType,
      归属公司: catalog?.company || u.provider,
      用途: catalog?.useCase || '',
      平台节点: catalog?.nodeEntry || '',
      serviceType: u.serviceType,
      provider: u.provider,
      总调用次数: u.totalCalls,
      成功次数: u.successCalls,
      失败次数: u.failedCalls,
      进行中次数: u.pendingCalls,
      总消耗积分: u.totalCredits,
      使用用户数: u.userCount,
      备注: catalog ? '' : '数据库有记录但目录未收录',
    });
  }

  for (const c of CATALOG) {
    if (seenCatalogKeys.has(c.modelId)) continue;
    mergedRows.push({
      类别: c.category,
      产品名称: c.productName,
      模型ID: c.modelId,
      归属公司: c.company,
      用途: c.useCase,
      平台节点: c.nodeEntry,
      serviceType: c.serviceTypes.join(', '),
      provider: '',
      总调用次数: 0,
      成功次数: 0,
      失败次数: 0,
      进行中次数: 0,
      总消耗积分: 0,
      使用用户数: 0,
      备注: '平台已接入，暂无用量记录',
    });
  }

  mergedRows.sort((a, b) => Number(b['总调用次数']) - Number(a['总调用次数']));

  const outDir = path.resolve(__dirname, '../..');
  const csvPath = path.join(outDir, 'TAI-platform-models-usage.csv');
  const headers = [
    '类别', '产品名称', '模型ID', '归属公司', '用途', '平台节点',
    'serviceType', 'provider', '总调用次数', '成功次数', '失败次数',
    '进行中次数', '总消耗积分', '使用用户数', '备注',
  ];
  const csvLines = [
    headers.join(','),
    ...mergedRows.map((row) => headers.map((h) => escapeCsv(row[h])).join(',')),
  ];
  fs.writeFileSync(csvPath, `\uFEFF${csvLines.join('\n')}`, 'utf8');

  const summary = {
    generatedAt,
    totalUsageRows: usage.length,
    totalCalls: usage.reduce((s, u) => s + u.totalCalls, 0),
    totalCredits: usage.reduce((s, u) => s + u.totalCredits, 0),
    catalogCount: CATALOG.length,
    mergedCount: mergedRows.length,
    csvPath,
  };

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
