import { memo } from "react";

interface BandEntry {
  timestamp: number;
  theta: number;
  alpha: number;
  beta: number;
  gamma: number;
}

interface FftBandChartProps {
  data: BandEntry[];
}

const CLR = { theta: "#8B5CF6", alpha: "#22C55E", beta: "#F59E0B" };

function pct(entries: BandEntry[]): { theta: number; alpha: number; beta: number } | null {
  if (entries.length === 0) return null;
  let t = 0, a = 0, b = 0, n = 0;
  for (const e of entries) {
    t += e.theta; a += e.alpha; b += e.beta; n++;
  }
  const base = t + a + b;
  if (!base || !n) return null;
  return { theta: (t / base) * 100, alpha: (a / base) * 100, beta: (b / base) * 100 };
}

function FftBandChart({ data }: FftBandChartProps) {
  const latest = data.length > 0 ? (() => {
    const last = data[data.length - 1];
    const base = last.theta + last.alpha + last.beta;
    if (!base) return null;
    return { theta: (last.theta / base) * 100, alpha: (last.alpha / base) * 100, beta: (last.beta / base) * 100 };
  })() : null;

  const avg = pct(data);
  const display = latest ?? avg;

  return (
    <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800">
      <div className="px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400">
            FFT 대역 파워
          </p>
          {data.length > 0 ? (
            <span className="text-[9px] text-[#9CA3AF] dark:text-slate-500">{data.length} epochs</span>
          ) : null}
        </div>
      </div>

      <div className="px-3 pb-3">
        {!display ? (
          <div className="flex h-[80px] items-center justify-center">
            <p className="text-[10px] text-[#9CA3AF] dark:text-slate-500">측정 시작 후 2초 주기로 갱신됩니다.</p>
          </div>
        ) : (
          <>
            {/* 스택 바 */}
            <div className="flex h-8 overflow-hidden rounded-lg mt-1">
              <div style={{ width: `${display.theta}%`, backgroundColor: CLR.theta }} className="transition-all duration-500" />
              <div style={{ width: `${display.alpha}%`, backgroundColor: CLR.alpha }} className="transition-all duration-500" />
              <div style={{ width: `${display.beta}%`, backgroundColor: CLR.beta }} className="transition-all duration-500" />
            </div>

            {/* 수치 */}
            <div className="mt-2 flex justify-between">
              {(["theta", "alpha", "beta"] as const).map((b) => (
                <div key={b} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CLR[b] }} />
                  <span className="text-xs font-bold text-[#111827] dark:text-white">{display[b].toFixed(1)}%</span>
                  <span className="text-[9px] text-[#6B7280] dark:text-slate-400">
                    {b === "theta" ? "세타" : b === "alpha" ? "알파" : "베타"}
                  </span>
                </div>
              ))}
            </div>

            {/* 미니 히스토리 (최근 10개 epoch) */}
            {data.length >= 2 ? (
              <div className="mt-2 flex gap-px h-6">
                {data.slice(-10).map((e, i) => {
                  const base = e.theta + e.alpha + e.beta;
                  if (!base) return <div key={i} className="flex-1 rounded-sm bg-gray-100 dark:bg-slate-800" />;
                  const tp = (e.theta / base) * 100;
                  const ap = (e.alpha / base) * 100;
                  return (
                    <div key={i} className="flex flex-1 flex-col overflow-hidden rounded-sm">
                      <div style={{ height: `${tp}%`, backgroundColor: CLR.theta }} />
                      <div style={{ height: `${ap}%`, backgroundColor: CLR.alpha }} />
                      <div style={{ flex: 1, backgroundColor: CLR.beta }} />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default memo(FftBandChart);
