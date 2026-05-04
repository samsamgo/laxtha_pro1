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
  color: string;
  subtitle: string;
}

const MINI_CHART_MAX_POINTS = 300;

const downsample = (values: number[], maxPoints: number): number[] => {
  if (values.length <= maxPoints) return values;
  const step = Math.ceil(values.length / maxPoints);
  const result: number[] = [];
  for (let i = 0; i < values.length; i += step) result.push(values[i]);
  const last = values[values.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
};

const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

function LineChartCard({ title, values, color, subtitle }: LineChartCardProps) {
  const { darkMode } = useFx2Theme();
  const latestValue = values[values.length - 1] ?? 0;

  const displayValues = useMemo(
    () => (values.length === 0 ? [] : downsample(values, MINI_CHART_MAX_POINTS)),
    [values]
  );

  const gridColor = darkMode ? "#334155" : "#F1F5F9";
  const textColor = darkMode ? "#94A3B8" : "#6B7280";

  const data = useMemo(
    () => ({
      labels: displayValues.map((_, i) => i),
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
    [displayValues, color]
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
          display: false,
          grid: { color: gridColor },
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
    [gridColor, textColor]
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
