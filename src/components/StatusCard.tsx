interface StatusCardProps {
  title: string;
  value: string;
  hint?: string;
  tone?: "primary" | "secondary" | "neutral";
}

const toneStyles = {
  primary: "text-fx2-primary",
  secondary: "text-fx2-secondary",
  neutral: "text-fx2-text"
};

export default function StatusCard({ title, value, hint, tone = "neutral" }: StatusCardProps) {
  return (
    <section className="fx2-card col-span-12 sm:col-span-6 xl:col-span-3">
      <h2 className="fx2-muted mb-3">{title}</h2>
      <p className={`fx2-value ${toneStyles[tone]}`}>{value}</p>
      {hint ? <p className="fx2-muted mt-3">{hint}</p> : null}
    </section>
  );
}
