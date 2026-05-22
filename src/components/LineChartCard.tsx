import { memo, useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useFx2Theme } from "../context/ThemeContext";

interface LineChartCardProps {
  values: number[];
  timestamps?: number[];
  color: string;
  label?: string;
  /** Friendly one-line explanation shown under the label for non-expert users. */
  description?: string;
  /** Live window width in seconds (default 60). */
  windowSeconds?: number;
}

const DEFAULT_WINDOW_SECONDS = 60;
const MAX_POINTS = 18000;
const CHART_HEIGHT = 100;

function hasAlignedTimestamps(values: number[], timestamps?: number[]): timestamps is number[] {
  return !!timestamps && timestamps.length === values.length;
}

function buildData(values: number[], timestamps?: number[], windowSeconds = DEFAULT_WINDOW_SECONDS): uPlot.AlignedData {
  const xs: number[] = [];
  const ys: number[] = [];

  if (values.length === 0) {
    return [new Float64Array(), new Float64Array()];
  }

  if (hasAlignedTimestamps(values, timestamps)) {
    let latestTime = Number.NaN;

    for (let i = values.length - 1; i >= 0; i -= 1) {
      const value = values[i];
      const time = timestamps[i] / 1000;
      if (Number.isFinite(value) && Number.isFinite(time)) {
        latestTime = time;
        break;
      }
    }

    if (!Number.isFinite(latestTime)) {
      return [new Float64Array(), new Float64Array()];
    }

    const minTime = latestTime - windowSeconds;

    for (let i = values.length - 1; i >= 0 && xs.length < MAX_POINTS; i -= 1) {
      const value = values[i];
      const time = timestamps[i] / 1000;

      if (!Number.isFinite(value) || !Number.isFinite(time)) {
        continue;
      }

      if (time < minTime) {
        break;
      }

      xs.push(time);
      ys.push(value);
    }

    xs.reverse();
    ys.reverse();
  } else {
    const sliceStart = Math.max(0, values.length - MAX_POINTS);

    for (let i = sliceStart; i < values.length; i += 1) {
      const value = values[i];

      if (!Number.isFinite(value)) {
        continue;
      }

      xs.push(i);
      ys.push(value);
    }
  }

  return [Float64Array.from(xs), Float64Array.from(ys)];
}

function paddedRange(_u: uPlot, dataMin: number | null, dataMax: number | null): [number, number] {
  if (dataMin === null || dataMax === null || !Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    return [-1, 1];
  }

  if (dataMin === dataMax) {
    const pad = Math.max(Math.abs(dataMin || 0) * 0.08, 1);
    return [dataMin - pad, dataMax + pad];
  }

  const pad = Math.max((dataMax - dataMin) * 0.12, Math.abs(dataMax) * 0.01, 0.001);
  return [dataMin - pad, dataMax + pad];
}

function drawBaseline(stroke: string) {
  return (u: uPlot) => {
    const yScale = u.scales.y;
    const yMin = yScale.min;
    const yMax = yScale.max;

    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin! > 0 || yMax! < 0) {
      return;
    }

    const ctx = u.ctx;
    const y = Math.round(u.valToPos(0, "y", true)) + 0.5;
    const x0 = u.bbox.left;
    const x1 = u.bbox.left + u.bbox.width;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.restore();
  };
}

function formatTimeLabels(_u: uPlot, values: number[]): string[] {
  return values.map((value) =>
    new Date(value * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  );
}

function makeOpts(w: number, color: string, darkMode: boolean, timeAxis: boolean, windowSeconds = DEFAULT_WINDOW_SECONDS): uPlot.Options {
  const gridColor = darkMode ? "#1E293B" : "#F1F5F9";
  const baselineColor = darkMode ? "#334155" : "#E5E7EB";
  const textColor = darkMode ? "#64748B" : "#9CA3AF";

  return {
    width: w,
    height: CHART_HEIGHT,
    cursor: { show: false },
    legend: { show: false },
    padding: [6, 4, 6, 0],
    scales: {
      x: {
        time: timeAxis,
        range: (_u, dataMin, dataMax) => {
          if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
            return [0, 1];
          }

          if (timeAxis) {
            return [dataMax - windowSeconds, dataMax];
          }

          if (dataMin === dataMax) {
            return [dataMin - 1, dataMax + 1];
          }

          return [dataMin, dataMax];
        },
      },
      y: {
        range: paddedRange,
      },
    },
    axes: [
      {
        show: timeAxis,
        stroke: textColor,
        grid: { show: false },
        ticks: { show: false },
        size: timeAxis ? 18 : 0,
        values: timeAxis ? formatTimeLabels : undefined,
      },
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
        width: 1.5,
        points: { show: false },
      },
    ],
    hooks: {
      draw: [drawBaseline(baselineColor)],
    },
  };
}

function LineChartCard({ values, timestamps, color, label, description, windowSeconds = DEFAULT_WINDOW_SECONDS }: LineChartCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uRef = useRef<uPlot | null>(null);
  const { darkMode } = useFx2Theme();
  const timeAxis = hasAlignedTimestamps(values, timestamps);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth > 0 ? el.clientWidth : 300;
    uRef.current?.destroy();
    uRef.current = new uPlot(makeOpts(w, color, darkMode, timeAxis, windowSeconds), buildData(values, timestamps, windowSeconds), el);

    const ro = new ResizeObserver(([entry]) => {
      const newW = Math.floor(entry.contentRect.width);
      if (newW > 0) uRef.current?.setSize({ width: newW, height: CHART_HEIGHT });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      uRef.current?.destroy();
      uRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, darkMode, timeAxis, windowSeconds]);

  useEffect(() => {
    uRef.current?.setData(buildData(values, timestamps, windowSeconds));
  }, [values, timestamps, windowSeconds]);

  return (
    <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800">
      {label ? (
        <div className="px-3 pt-2.5 pb-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400">
              {label}
            </p>
          </div>
          {description ? (
            <p className="mt-0.5 ml-4 text-[10px] leading-4 text-[#6B7280] dark:text-slate-300">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="w-full"
        role={label ? "img" : undefined}
        aria-label={label ? `${label}: 최근 ${windowSeconds}초 추이` : undefined}
      />
    </div>
  );
}

export default memo(LineChartCard);
