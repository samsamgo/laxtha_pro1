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
  const isUart = mode === "uart";
  const safeValues = values.length > 0 ? values : [0];
  const latestValue = safeValues[safeValues.length - 1] ?? 0;

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
        pointHoverBorderColor: "#FFFFFF",
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
          color: "#F1F5F9",
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
          color: "#F1F5F9",
          drawTicks: false,
        },
        ticks: {
          color: "#6B7280",
          padding: 10,
          font: { size: 11 },
          stepSize: isUart ? 32 : undefined,
          callback: isUart
            ? (value: string | number) => String(Math.round(Number(value)))
            : (value: string | number) => Number(value).toFixed(1),
        },
        title: {
          display: isUart,
          text: "Byte Value (0–255)",
          color: "#6B7280",
          font: { size: 10 },
        },
      },
    },
  };

  return (
    <section className="fx2-card">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="fx2-title">{title}</h2>
          <p className="mt-1 text-xs text-[#6B7280]">{subtitle}</p>
        </div>
        <div className="flex-shrink-0 rounded-2xl bg-[#EAF0F8] px-4 py-2.5 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
            Latest
          </p>
          <p className="mt-0.5 text-lg font-bold text-[#111827]">
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
