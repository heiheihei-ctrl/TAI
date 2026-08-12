/** 火山引擎相关 API 的 serviceType（Seedance / Seedream 方舟 / 视频增强等） */
export const VOLCENGINE_API_SERVICE_TYPES = [
  'doubao-video',
  'volc-enhance-video',
  'doubao-seedream-5-0-260128',
] as const;

export type VolcengineMonthlyCreditStat = {
  month: string;
  totalCredits: number;
  totalCalls: number;
};

export function buildVolcengineMonthlySeries(
  rows: Array<{ month: string; totalCredits: number; totalCalls: number }>,
  months: number,
): VolcengineMonthlyCreditStat[] {
  const map = new Map(
    rows.map((row) => [
      row.month,
      {
        totalCredits: row.totalCredits,
        totalCalls: row.totalCalls,
      },
    ]),
  );

  const startDate = new Date();
  startDate.setUTCDate(1);
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCMonth(startDate.getUTCMonth() - (months - 1));

  const result: VolcengineMonthlyCreditStat[] = [];
  const cursor = new Date(startDate);
  const end = new Date();
  end.setUTCDate(1);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    const month = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    const item = map.get(month);
    result.push({
      month,
      totalCredits: item?.totalCredits ?? 0,
      totalCalls: item?.totalCalls ?? 0,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return result;
}

/** 全模型月度积分消耗（含按 provider 拆分） */
export type ModelMonthlyCreditStat = {
  month: string;
  totalCredits: number;
  totalCalls: number;
  /** 按 provider 聚合的积分消耗 */
  byProvider: Array<{ provider: string; credits: number; calls: number }>;
};

export function buildAllModelsMonthlySeries(
  rows: Array<{
    month: string;
    provider: string;
    credits: number;
    calls: number;
  }>,
  months: number,
): ModelMonthlyCreditStat[] {
  type MonthMap = {
    totalCredits: number;
    totalCalls: number;
    providerMap: Map<string, { credits: number; calls: number }>;
  };
  const map = new Map<string, MonthMap>();
  for (const row of rows) {
    let bucket = map.get(row.month);
    if (!bucket) {
      bucket = { totalCredits: 0, totalCalls: 0, providerMap: new Map() };
      map.set(row.month, bucket);
    }
    bucket.totalCredits += row.credits;
    bucket.totalCalls += row.calls;
    const p = bucket.providerMap.get(row.provider) ?? { credits: 0, calls: 0 };
    p.credits += row.credits;
    p.calls += row.calls;
    bucket.providerMap.set(row.provider, p);
  }

  const startDate = new Date();
  startDate.setUTCDate(1);
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCMonth(startDate.getUTCMonth() - (months - 1));

  const result: ModelMonthlyCreditStat[] = [];
  const cursor = new Date(startDate);
  const end = new Date();
  end.setUTCDate(1);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    const month = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    const bucket = map.get(month);
    const byProvider = bucket
      ? Array.from(bucket.providerMap.entries())
          .map(([provider, v]) => ({
            provider,
            credits: v.credits,
            calls: v.calls,
          }))
          .sort((a, b) => b.credits - a.credits)
      : [];
    result.push({
      month,
      totalCredits: bucket?.totalCredits ?? 0,
      totalCalls: bucket?.totalCalls ?? 0,
      byProvider,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return result;
}
