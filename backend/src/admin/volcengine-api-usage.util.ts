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
