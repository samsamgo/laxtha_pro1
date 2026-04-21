import {
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useFx2Theme } from "../context/ThemeContext";
import type { DeviceMode } from "../types/fx2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip
);

interface LineChartCardProps {
  title: string;
  values: number[];
  color: string;
  subtitle: string;
  mode?: DeviceMode;
}

export default function LineChartCard({
  title,
  values,
  color,
  subtitle,
  mode,
}: LineChartCardProps) {
  const { darkMode } = useFx2Theme();
  const isUart = mode === "uart";
  const safeValues = values.length > 0 ? values : [0];
  const latestValue = safeValues[safeValues.length - 1] ?? 0;
  const gridColor = darkMode ? "#334155" : "#F1F5F9";
  const tickColor = darkMode ? "#94A3B8" : "#6B7280";
  const pointHoverBorderColor = darkMode ? "#1E293B" : "#FFFFFF";

  const data = {
    labels: safeValues.map((_, index) => `${index + 1}`),
    datasets: [
      {
        label: title,
        data: safeValues,
        borderColor: color,
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHitRadius: 12,
        pointHoverRadius: isUart ? 0 : 4,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor,
        pointHoverBorderWidth: 2,
        fill: false,
        tension: isUart ? 0 : 0.4,
        stepped: isUart ? ("before" as const) : (false as const),
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    animations: {
      radius: {
        duration: 300,
        easing: "linear",
        loop: (context) => context.active,
      },
    },
    interaction: {
      mode: "nearest",
      intersect: false,
      axis: "x",
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
      },
    },
    scales: {
      x: {
        border: {
          display: false,
        },
        grid: {
          display: true,
          drawOnChartArea: true,
          drawTicks: false,
          color: gridColor,
        },
        ticks: {
          display: false,
        },
      },
      y: {
        min: isUart ? 0 : undefined,
        max: isUart ? 255 : undefined,
        border: {
          display: false,
        },
        grid: {
          color: gridColor,
          drawTicks: false,
        },
        ticks: {
          color: tickColor,
          padding: 10,
          font: { size: 11 },
          stepSize: isUart ? 32 : undefined,
          callback: isUart
            ? (value: string | number) => String(Math.round(Number(value)))
            : (value: string | number) => Number(value).toFixed(1),
        },
        title: {
          display: isUart,
          text: "Byte Value (0-255)",
          color: tickColor,
          font: { size: 10 },
        },
      },
    },
  };

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
        <Line data={data} options={options} />
      </div>
    </section>
  );
}
