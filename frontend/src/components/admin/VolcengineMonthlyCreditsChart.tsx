import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { VolcengineMonthlyCreditStat } from "@/services/adminApi";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

type Props = {
  data: VolcengineMonthlyCreditStat[];
};

export default function VolcengineMonthlyCreditsChart({ data }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || !data?.length) {
      return;
    }

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;
    chart.setOption(
      {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          borderColor: "#e5e7eb",
          borderWidth: 1,
          textStyle: {
            color: "#374151",
            fontSize: 12,
          },
          formatter: (params: unknown) => {
            if (!Array.isArray(params) || params.length === 0) {
              return "";
            }
            const title =
              (params[0] as { axisValueLabel?: string; name?: string }).axisValueLabel ??
              (params[0] as { name?: string }).name ??
              "";
            const creditsPoint = params.find(
              (item) => (item as { seriesName?: string }).seriesName === "消耗积分",
            ) as { marker?: string; value?: number } | undefined;
            const callsPoint = params.find(
              (item) => (item as { seriesName?: string }).seriesName === "调用次数",
            ) as { marker?: string; value?: number } | undefined;
            const credits = typeof creditsPoint?.value === "number" ? creditsPoint.value : 0;
            const calls = typeof callsPoint?.value === "number" ? callsPoint.value : 0;
            return [
              title,
              `${creditsPoint?.marker ?? ""}消耗积分：${credits.toLocaleString()}`,
              `${callsPoint?.marker ?? ""}调用次数：${calls.toLocaleString()}`,
            ].join("<br/>");
          },
        },
        grid: {
          left: 48,
          right: 16,
          top: 16,
          bottom: 32,
        },
        xAxis: {
          type: "category",
          data: data.map((item) => item.month),
          axisLine: {
            lineStyle: { color: "#e5e7eb" },
          },
          axisLabel: {
            color: "#6b7280",
            fontSize: 11,
            rotate: data.length > 8 ? 35 : 0,
          },
          axisTick: {
            show: false,
          },
        },
        yAxis: {
          type: "value",
          minInterval: 1,
          splitLine: {
            lineStyle: { color: "#f3f4f6" },
          },
          axisLabel: {
            color: "#9ca3af",
            fontSize: 11,
          },
        },
        series: [
          {
            name: "消耗积分",
            type: "bar",
            barMaxWidth: 36,
            itemStyle: {
              color: "#f97316",
              borderRadius: [4, 4, 0, 0],
            },
            data: data.map((item) => item.totalCredits),
          },
          {
            name: "调用次数",
            type: "bar",
            barMaxWidth: 36,
            itemStyle: {
              color: "#fdba74",
              borderRadius: [4, 4, 0, 0],
            },
            data: data.map((item) => item.totalCalls),
            barGap: "-100%",
            opacity: 0,
            emphasis: { disabled: true },
            tooltip: { show: true },
          },
        ],
      },
      { notMerge: true },
    );

    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [data]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  if (!data || data.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">暂无火山引擎消耗数据</div>;
  }

  const totalCredits = data.reduce((sum, item) => sum + item.totalCredits, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">火山引擎 API 月度积分消耗</h3>
          <p className="mt-1 text-xs text-gray-500">
            统计 Seedance、Seedream（火山方舟）、视频增强等火山引擎相关调用
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">近 {data.length} 个月合计</div>
          <div className="text-lg font-semibold text-orange-600">
            {totalCredits.toLocaleString()} 积分
          </div>
        </div>
      </div>
      <div ref={chartRef} className="h-64 w-full" />
    </div>
  );
}
