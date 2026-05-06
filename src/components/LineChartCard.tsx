import { memo, useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useFx2Theme } from "../context/ThemeContext";

interface LineChartCardProps {
  values: number[];
  timestamps?: number[];
  color: string;
}

const MAX_POINTS = 300;

function buildData(values: number[], timestamps?: number[]): uPlot.AlignedData {
  if (values.length === 0) {
    return [new Float64Array([0]), new Float64Array([0])];
  }
  const hasTs = !!timestamps && timestamps.length === values.length;
  let vs = values;
  let ts = timestamps;
  if (values.length > MAX_POINTS) {
    const step = Math.ceil(values.length / MAX_POINTS);
    const dsV: number[] = [];
    const dsT: number[] = [];
    for (let i = 0; i < values.length; i += step) {
      dsV.push(values[i]);
      if (hasTs) dsT.push(timestamps![i]);
    }
    if (dsV[dsV.length - 1] !== values[values.length - 1]) {
      dsV.push(values[values.length - 1]);
      if (hasTs) dsT.push(timestamps![timestamps!.length - 1]);
    }
    vs = dsV;
    ts = hasTs ? dsT : undefined;
  }
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
        size: 30,
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

function LineChartCard({ values, timestamps, color }: LineChartCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uRef = useRef<uPlot | null>(null);
  const { darkMode } = useFx2Theme();
  const colorRef = useRef(color);
  colorRef.current = color;
  const darkRef = useRef(darkMode);
  darkRef.current = darkMode;

  // Create chart; recreate when color or theme changes
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

  // Update data only
  useEffect(() => {
    uRef.current?.setData(buildData(values, timestamps));
  }, [values, timestamps]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-2xl bg-white dark:bg-slate-900"
    />
  );
}

export default memo(LineChartCard);
