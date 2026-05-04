import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  type ChartOptions,
} from "chart.js";
import { memo, useMemo } from "react";
import { Line } from "react-chartjs-2";
import { useFx2Theme } from "../context/ThemeContext";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler);

interface LineChartCardProps {
  title: string;
  values: number[];
  timestamps?: number[];
  color: string;
  subtitle: string;
}

const MINI_CHART_MAX_POINTS = 300;
const X_TICK_COUNT = 4;

const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const downsample = (
  values: number[],
  maxPoints: number,
  timestamps?: number[],
): { values: number[]; labels: string[] } => {
  const hasTs = !!timestamps && timestamps.length === values.length;

  const buildLabels = (ts: number[]): string[] => {
    const n = ts.length;
    if (n === 0) return [];
    const step = Math.max(1, Math.floor(n / X_TICK_COUNT));
    return ts.map((t, i) =>
      i === 0 || i === n - 1 || i % step === 0 ? formatTime(t) : "",
    );
  };

  if (values.length <= maxPoints) {
    return {
      values,
      labels: hasTs ? buildLabels(timestamps!) : values.map((_, i) => String(i)),
    };
  }

  const step = Math.ceil(values.length / maxPoints);
  const dsValues: number[] = [];
  const dsTs: number[] = [];
  for (let i = 0; i < values.length; i += step) {
    dsValues.push(values[i]);
    if (hasTs) dsTs.push(timestamps![i]);
  }
  const last = values[values.length - 1];
  if (dsValues[dsValues.length - 1] !== last) {
    dsValues.push(last);
    if (hasTs) dsTs.push(timestamps![timestamps!.length - 1]);
  }

  return {
    values: dsValues,
    labels: hasTs ? buildLabels(dsTs) : dsValues.map((_, i) => String(i)),
  };
};

const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

function LineChartCard({ title, values, timestamps, color, subtitle }: LineChartCardProps) {
  const { darkMode } = useFx2Theme();
  const latestValue = values[values.length - 1] ?? 0;
  const hasTimestamps = !!timestamps && timestamps.length === values.length && values.length > 0;

  const { values: displayValues, labels: displayLabels } = useMemo(
    () => (values.length === 0 ? { values: [], labels: [] } : downsample(values, MINI_CHART_MAX_POINTS, timestamps)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, timestamps]
  );

  const gridColor = darkMode ? "#334155" : "#F1F5F9";
  const textColor = darkMode ? "#94A3B8" : "#6B7280";

  const data = useMemo(
    () => ({
      labels: displayLabels,
      datasets: [
        {
          data: displayValues,
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.08),
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        },
      ],
    }),
    [displayValues, displayLabels, color]
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          display: hasTimestamps,
          grid: { display: false },
          ticks: {
            color: textColor,
            font: { size: 9 },
            maxRotation: 0,
            autoSkip: false,
          },
          border: { display: false },
        },
        y: {
          display: true,
          position: "right",
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            maxTicksLimit: 3,
            font: { size: 10 },
          },
          border: { display: false },
        },
      },
    }),
    [gridColor, textColor, hasTimestamps]
  );

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
            {values.length === 0 ? "--" : latestValue.toFixed(2)}
          </p>
        </div>
      </header>

      <div className="h-56 overflow-hidden rounded-2xl bg-transparent p-1">
        {values.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-[#6B7280] dark:text-slate-500">
              측정이 시작되면 데이터가 표시됩니다
            </p>
          </div>
        ) : (
          <Line data={data} options={options} />
        )}
      </div>
    </section>
  );
}

export default memo(LineChartCard);
