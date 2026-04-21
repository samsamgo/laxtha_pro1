interface StatusCardProps {
  title: string;
  value: string;
  hint?: string;
  tone?: "primary" | "secondary" | "neutral" | "success" | "warning" | "danger";
}

const toneConfig = {
  primary:   { dot: "bg-[#2563EB]",  value: "text-[#2563EB]"  },
  secondary: { dot: "bg-[#06B6D4]",  value: "text-[#06B6D4]"  },
  neutral:   { dot: "bg-[#6B7280]",  value: "text-[#111827]"  },
  success:   { dot: "bg-[#22C55E]",  value: "text-[#22C55E]"  },
  warning:   { dot: "bg-[#F59E0B]",  value: "text-[#F59E0B]"  },
  danger:    { dot: "bg-[#EF4444]",  value: "text-[#EF4444]"  },
} as const;

export default function StatusCard({ title, value, hint, tone = "neutral" }: StatusCardProps) {
  const config = toneConfig[tone];

  return (
    <div className="flex flex-col gap-3 rounded-card bg-white p-5 shadow-card transition-colors duration-300 dark:bg-[#1E293B]">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 flex-shrink-0 rounded-full transition-colors duration-300 ${config.dot}`}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-[#6B7280] dark:text-slate-400">
          {title}
        </span>
      </div>

      <p className={`text-2xl font-bold tracking-tight dark:text-white ${config.value}`}>
        {value}
      </p>

      {hint ? (
        <p className="text-xs text-[#6B7280] dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}
