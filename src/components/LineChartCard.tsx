import { memo, useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useFx2Theme } from "../context/ThemeContext";

interface LineChartCardProps {
  values: number[];
  timestamps?: number[];
  color: string;
  label?: string;
}

// Keep only the most recent N points — sliding window, no growing history
const MAX_POINTS = 3600;

function buildData(values: number[], timestamps?: number[]): uPlot.AlignedData {
  if (values.length === 0) {
    return [new Float64Array([0]), new Float64Array([0])];
  }
  const sliceStart = Math.max(0, values.length - MAX_POINTS);
  const vs = values.slice(sliceStart);
  const ts = timestamps ? timestamps.slice(sliceStart) : undefined;
  const hasTs = !!ts && ts.length === vs.length;
  const xData = hasTs
    ? Float64Array.from(ts!.map((t) => t / 1000))
    : Float64Array.from(vs.map((_, i) => i));
  return [xData, Float64Array.from(vs)];
}

function makeOpts(w: number, color: string, darkMode: boolean): uPlot.Options {
  const gridColor = darkMode ? "#1E293B" : "#F1F5F9";
  const textColor = darkMode ? "#64748B" : "#9CA3AF";
  return {
    width: w,
    height: 100,
    cursor: { show: false },
    legend: { show: false },
    padding: [4, 4, 4, 0],
    axes: [
      { show: false },
      {
        stroke: textColor,
        grid: { stroke: gridColor, width: 1 },
        ticks: { show: false },
        size: 28,
      },
    ],
    series: [
      {},
      {
        stroke: color,
        fill: `${color}18`,
        width: 1.5,
        points: { show: false },
      },
    ],
  };
}

function LineChartCard({ values, timestamps, color, label }: LineChartCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uRef = useRef<uPlot | null>(null);
  const { darkMode } = useFx2Theme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth > 0 ? el.clientWidth : 300;
    uRef.current?.destroy();
    uRef.current = new uPlot(makeOpts(w, color, darkMode), buildData(values, timestamps), el);

    const ro = new ResizeObserver(([entry]) => {
      const newW = Math.floor(entry.contentRect.width);
      if (newW > 0) uRef.current?.setSize({ width: newW, height: 100 });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      uRef.current?.destroy();
      uRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, darkMode]);

  useEffect(() => {
    uRef.current?.setData(buildData(values, timestamps));
  }, [values, timestamps]);

  return (
    <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800">
      {label ? (
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
          <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400">
            {label}
          </p>
        </div>
      ) : null}
      <div ref={containerRef} className="w-full" />
    </div>
  );
}

export default memo(LineChartCard);
