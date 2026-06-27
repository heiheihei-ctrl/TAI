import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { DashboardStats } from "@/services/adminApi";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

type Props = {
  data: DashboardStats["userTrend"];
};

export default function DashboardTrendChart({ data }: Props) {
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
            const lines = params.map((item) => {
              const point = item as { marker?: string; seriesName?: string; value?: number };
              const value = typeof point.value === "number" ? point.value : 0;
              return `${point.marker ?? ""}${point.seriesName ?? ""}：${value}`;
            });
            return [title, ...lines].join("<br/>");
          },
        },
        legend: {
          top: 0,
          left: 0,
          itemWidth: 10,
          itemHeight: 10,
          textStyle: {
            color: "#4b5563",
            fontSize: 12,
          },
          data: ["注册用户", "日活用户"],
        },
        grid: {
          left: 40,
          right: 16,
          top: 36,
          bottom: 28,
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: data.map((item) => item.date),
          axisLine: {
            lineStyle: { color: "#e5e7eb" },
          },
          axisLabel: {
            color: "#9ca3af",
            fontSize: 11,
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
            name: "注册用户",
            type: "line",
            smooth: true,
            showSymbol: data.length <= 31,
            symbolSize: 6,
            lineStyle: {
              width: 2,
              color: "#3b82f6",
            },
            itemStyle: {
              color: "#3b82f6",
            },
            data: data.map((item) => item.registeredUsers),
          },
          {
            name: "日活用户",
            type: "line",
            smooth: true,
            showSymbol: data.length <= 31,
            symbolSize: 6,
            lineStyle: {
              width: 2,
              color: "#10b981",
            },
            itemStyle: {
              color: "#10b981",
            },
            data: data.map((item) => item.dailyActiveUsers),
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
    return <div className="py-8 text-center text-sm text-gray-400">暂无趋势数据</div>;
  }

  return <div ref={chartRef} className="h-56 w-full" />;
};
