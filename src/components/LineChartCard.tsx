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
}

export default function LineChartCard({
  title,
  values,
  color,
  subtitle,
}: LineChartCardProps) {
  const safeValues = values.length > 0 ? values : [0];
  const latestValue = safeValues[safeValues.length - 1] ?? 0;

  const data = {
    labels: safeValues.map((_, index) => `${index + 1}`),
    datasets: [
      {
        label: title,
        data: safeValues,
        borderColor: color,
        backgroundColor: `${color}55`,
        borderWidth: 2.4,
        pointRadius: 2,
        pointHitRadius: 8,
        pointHoverRadius: 12,
        pointHoverBackgroundColor: "#FACC15",
        pointHoverBorderColor: "#FFFFFF",
        pointHoverBorderWidth: 2,
        fill: false,
        tension: 0.4,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    animations: {
      radius: {
        duration: 400,
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
          display: true,
          color: "rgba(148, 163, 184, 0.24)",
        },
        grid: {
          display: true,
          drawOnChartArea: true,
          drawTicks: false,
          color: "rgba(148, 163, 184, 0.12)",
        },
        ticks: {
          display: false,
        },
      },
      y: {
        border: {
          display: false,
        },
        grid: {
          color: "rgba(148, 163, 184, 0.14)",
          drawTicks: false,
        },
        ticks: {
          color: "#64748B",
          padding: 10,
          callback: (value: string | number) => Number(value).toFixed(1),
        },
      },
    },
  };

  return (
    <section className="fx2-card col-span-12 xl:col-span-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="fx2-title">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-fx2-muted">{subtitle}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-fx2-muted">
            Latest
          </p>
          <p className="mt-1 text-xl font-semibold text-fx2-text">
            {latestValue.toFixed(2)}
          </p>
        </div>
      </header>

      <div className="h-64 rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] p-3">
        <Line data={data} options={options} />
      </div>
    </section>
  );
}
