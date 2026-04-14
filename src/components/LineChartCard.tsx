interface LineChartCardProps {
  title: string;
  values: number[];
  color: string;
  subtitle: string;
}

export default function LineChartCard({ title, values, color, subtitle }: LineChartCardProps) {
  const points = values
    .map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${50 - value * 15}`)
    .join(" ");

  return (
    <section className="fx2-card col-span-12 xl:col-span-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="fx2-title">{title}</h2>
          <p className="mt-1 text-sm text-fx2-muted">{subtitle}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-fx2-muted">
          최근 {values.length} 샘플
        </span>
      </header>
      <div className="h-44 rounded-[22px] bg-slate-50 p-3">
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        </svg>
      </div>
    </section>
  );
}
