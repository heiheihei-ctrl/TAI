import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ModelMonthlyCreditStat } from "@/services/adminApi";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

type Props = {
  data: ModelMonthlyCreditStat[];
};

const PROVIDER_COLORS: Record<string, string> = {
  doubao: "#f97316",
  kling: "#3b82f6",
  gemini: "#8b5cf6",
  sora: "#10b981",
  dashscope: "#ec4899",
  vidu: "#f59e0b",
  midjourney: "#6366f1",
  minimax: "#06b6d4",
  tencent: "#22c55e",
  seedream5: "#ef4444",
  unknown: "#9ca3af",
};

function pickColor(provider: string, index: number): string {
  return (
    PROVIDER_COLORS[provider] ??
    [
      "#f97316",
      "#3b82f6",
      "#8b5cf6",
      "#10b981",
      "#ec4899",
      "#f59e0b",
      "#6366f1",
      "#06b6d4",
      "#22c55e",
      "#ef4444",
    ][index % 10]
  );
}

export default function ModelMonthlyCreditsChart({ data }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  const providers = useMemo(() => {
    const set = new Set<string>();
    data.forEach((item) =>
      item.byProvider.forEach((p) => set.add(p.provider)),
    );
    return Array.from(set).sort();
  }, [data]);

  useEffect(() => {
    if (!chartRef.current || !data?.length) {
      return;
    }

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;
    const series = providers.map((provider, idx) => ({
      name: provider,
      type: "bar" as const,
      stack: "total",
      barMaxWidth: 36,
      itemStyle: {
        color: pickColor(provider, idx),
        borderRadius:
          idx === providers.length - 1
            ? [4, 4, 0, 0]
            : undefined,
      },
      emphasis: { focus: "series" as const },
      data: data.map((item) => {
        const found = item.byProvider.find((p) => p.provider === provider);
        return found?.credits ?? 0;
      }),
    }));

    chart.setOption(
      {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          borderColor: "#e5e7eb",
          borderWidth: 1,
          textStyle: { color: "#374151", fontSize: 12 },
          formatter: (params: unknown) => {
            if (!Array.isArray(params) || params.length === 0) return "";
            const title =
              (params[0] as { axisValueLabel?: string; name?: string })
                .axisValueLabel ??
              (params[0] as { name?: string }).name ??
              "";
            const monthData = data.find((d) => d.month === title);
            const total = monthData?.totalCredits ?? 0;
            const totalCalls = monthData?.totalCalls ?? 0;
            const lines = [
              `<div style="font-weight:600;margin-bottom:4px;">${title}</div>`,
              `<div>总消耗积分：<span style="color:#f97316;font-weight:600;">${total.toLocaleString()}</span></div>`,
              `<div>总调用次数：${totalCalls.toLocaleString()}</div>`,
              `<div style="margin-top:6px;border-top:1px dashed #e5e7eb;padding-top:4px;">`,
            ];
            for (const p of params as Array<{
              marker?: string;
              seriesName?: string;
              value?: number;
            }>) {
              const v = typeof p.value === "number" ? p.value : 0;
              if (v <= 0) continue;
              lines.push(
                `<div>${p.marker ?? ""}${p.seriesName ?? ""}：${v.toLocaleString()}</div>`,
              );
            }
            lines.push("</div>");
            return lines.join("");
          },
        },
        legend: {
          bottom: 0,
          type: "scroll",
          textStyle: { color: "#6b7280", fontSize: 11 },
          itemWidth: 12,
          itemHeight: 12,
        },
        grid: {
          left: 56,
          right: 16,
          top: 16,
          bottom: 56,
        },
        xAxis: {
          type: "category",
          data: data.map((item) => item.month),
          axisLine: { lineStyle: { color: "#e5e7eb" } },
          axisLabel: {
            color: "#6b7280",
            fontSize: 11,
            rotate: data.length > 8 ? 35 : 0,
          },
          axisTick: { show: false },
        },
        yAxis: {
          type: "value",
          minInterval: 1,
          splitLine: { lineStyle: { color: "#f3f4f6" } },
          axisLabel: {
            color: "#9ca3af",
            fontSize: 11,
            formatter: (val: number) =>
              val >= 10000 ? `${(val / 1000).toFixed(0)}k` : String(val),
          },
        },
        series,
      },
      { notMerge: true },
    );

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [data, providers]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        暂无模型消耗数据
      </div>
    );
  }

  const totalCredits = data.reduce((sum, item) => sum + item.totalCredits, 0);
  const totalCalls = data.reduce((sum, item) => sum + item.totalCalls, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            所有模型 API 月度积分消耗
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            统计所有 provider 的模型调用，按 provider 堆叠展示
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">
            近 {data.length} 个月 · 共 {providers.length} 个 provider
          </div>
          <div className="text-lg font-semibold text-orange-600">
            {totalCredits.toLocaleString()} 积分
          </div>
          <div className="text-xs text-gray-500">
            {totalCalls.toLocaleString()} 次调用
          </div>
        </div>
      </div>
      <div ref={chartRef} className="h-72 w-full" />
    </div>
  );
}