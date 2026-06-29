import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ProfileDistributionItem } from "@/services/adminApi";

echarts.use([
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

type Props = {
  title: string;
  subtitle?: string;
  data: ProfileDistributionItem[];
  chartType?: "bar" | "pie";
  emptyText?: string;
  height?: number;
  className?: string;
};

type ChartPoint = {
  name: string;
  value: number;
  percentage: number;
};

const PIE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#6366f1",
  "#f97316",
  "#14b8a6",
  "#a855f7",
];

const EMPTY_LABEL = "未填写";

const toChartPoints = (data: ProfileDistributionItem[]): ChartPoint[] => {
  const filtered = data.filter(
    (item) => item.label !== EMPTY_LABEL && item.value > 0,
  );
  const total = filtered.reduce((sum, item) => sum + item.value, 0);
  return filtered.map((item) => ({
    name: item.label,
    value: item.value,
    percentage: total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0,
  }));
};

const formatTooltip = (params: unknown) => {
  const point = (Array.isArray(params) ? params[0] : params) as {
    name?: string;
    value?: number;
    data?: ChartPoint;
    percent?: number;
  };
  const meta = point.data;
  const name = meta?.name ?? point.name ?? "";
  const count = meta?.value ?? point.value ?? 0;
  const percentage =
    typeof meta?.percentage === "number"
      ? meta.percentage
      : typeof point.percent === "number"
        ? Math.round(point.percent * 10) / 10
        : 0;
  return `${name}<br/>人数：${count}<br/>占比：${percentage}%`;
};

export default function DashboardDistributionChart({
  title,
  subtitle,
  data,
  chartType = "bar",
  emptyText = "暂无数据",
  height = 280,
  className,
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const chartPoints = useMemo(() => toChartPoints(data), [data]);

  useEffect(() => {
    if (!chartRef.current || !chartPoints.length) {
      return;
    }

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;

    if (chartType === "pie") {
      chart.setOption(
        {
          color: PIE_COLORS,
          tooltip: {
            trigger: "item",
            backgroundColor: "rgba(255, 255, 255, 0.96)",
            borderColor: "#e5e7eb",
            borderWidth: 1,
            textStyle: { color: "#374151", fontSize: 12 },
            formatter: formatTooltip,
          },
          legend: {
            type: "scroll",
            orient: "vertical",
            right: 0,
            top: "middle",
            textStyle: { color: "#4b5563", fontSize: 11 },
          },
          series: [
            {
              type: "pie",
              radius: ["42%", "68%"],
              center: ["38%", "50%"],
              avoidLabelOverlap: true,
              itemStyle: {
                borderRadius: 6,
                borderColor: "#fff",
                borderWidth: 2,
              },
              label: {
                show: true,
                formatter: (params: { data?: ChartPoint; percent?: number; name?: string }) => {
                  const meta = params.data;
                  const percentage =
                    typeof meta?.percentage === "number"
                      ? meta.percentage
                      : typeof params.percent === "number"
                        ? Math.round(params.percent * 10) / 10
                        : 0;
                  return `${params.name}\n${percentage}%`;
                },
                color: "#4b5563",
                fontSize: 11,
              },
              labelLine: {
                length: 12,
                length2: 8,
              },
              data: chartPoints,
            },
          ],
        },
        { notMerge: true },
      );
    } else {
      chart.setOption(
        {
          color: ["#3b82f6"],
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            backgroundColor: "rgba(255, 255, 255, 0.96)",
            borderColor: "#e5e7eb",
            borderWidth: 1,
            textStyle: { color: "#374151", fontSize: 12 },
            formatter: formatTooltip,
          },
          grid: {
            left: 8,
            right: 16,
            top: 12,
            bottom: 8,
            containLabel: true,
          },
          xAxis: {
            type: "value",
            minInterval: 1,
            splitLine: { lineStyle: { color: "#f3f4f6" } },
            axisLabel: { color: "#9ca3af", fontSize: 11 },
          },
          yAxis: {
            type: "category",
            inverse: true,
            data: chartPoints.map((item) => item.name),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              color: "#4b5563",
              fontSize: 11,
              width: 96,
              overflow: "truncate",
            },
          },
          series: [
            {
              type: "bar",
              barMaxWidth: 18,
              data: chartPoints,
              itemStyle: {
                borderRadius: [0, 4, 4, 0],
              },
              label: {
                show: true,
                position: "right",
                color: "#6b7280",
                fontSize: 11,
                formatter: (params: { data?: ChartPoint }) => {
                  const percentage = params.data?.percentage;
                  return typeof percentage === "number" ? `${percentage}%` : "";
                },
              },
            },
          ],
        },
        { notMerge: true },
      );
    }

    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [chartPoints, chartType]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  return (
    <div className={`rounded-lg border bg-white p-4 shadow-sm ${className ?? ""}`}>
      <div className="mb-3">
        <div className="text-sm font-medium text-gray-700">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-gray-500">{subtitle}</div> : null}
      </div>
      {chartPoints.length > 0 ? (
        <div ref={chartRef} style={{ height }} className="w-full" />
      ) : (
        <div
          className="flex items-center justify-center text-sm text-gray-400"
          style={{ height }}
        >
          {emptyText}
        </div>
      )}
    </div>
  );
}
