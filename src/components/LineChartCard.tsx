import { createChart, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { memo, useEffect, useRef } from "react";
import { useFx2Theme } from "../context/ThemeContext";
import type { DeviceMode } from "../types/fx2";

interface LineChartCardProps {
  title: string;
  values: number[];
  color: string;
  subtitle: string;
  mode?: DeviceMode;
}

function LineChartCard({ title, values, color, subtitle, mode }: LineChartCardProps) {
  const { darkMode } = useFx2Theme();
  const isUart = mode === "uart";
  const safeValues = values.length > 0 ? values : [0];
  const latestValue = safeValues[safeValues.length - 1] ?? 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);

  const gridColor = darkMode ? "#334155" : "#F1F5F9";
  const textColor = darkMode ? "#94A3B8" : "#6B7280";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    chartRef.current?.remove();

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: "transparent" },
        textColor,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        ...(isUart ? { autoScale: false } : {}),
      },
      timeScale: {
        borderVisible: false,
        visible: false,
      },
      handleScale: false,
      handleScroll: false,
    });

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    if (isUart) {
      chart.priceScale("right").applyOptions({ autoScale: false });
    }

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [darkMode, color, isUart, gridColor, textColor]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const data = safeValues.map((value, i) => ({
      time: (i + 1) as UTCTimestamp,
      value,
    }));

    series.setData(data);

    if (isUart) {
      chartRef.current?.priceScale("right").applyOptions({
        autoScale: false,
      });
    }

    chartRef.current?.timeScale().fitContent();
  }, [safeValues, isUart]);

  return (
    <section className="fx2-card fx2-outline">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="fx2-title">{title}</h2>
          <p className="mt-1 text-xs text-[#6B7280] dark:text-slate-400">{subtitle}</p>
        </div>
        <div className="fx2-surface rounded-2xl px-4 py-2.5 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6B7280] dark:text-slate-400">
            Latest
          </p>
          <p className="mt-0.5 text-lg font-bold text-[#111827] dark:text-white">
            {latestValue.toFixed(2)}
          </p>
        </div>
      </header>

      <div className="h-56 rounded-2xl bg-transparent p-1">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </section>
  );
}

export default memo(LineChartCard);
