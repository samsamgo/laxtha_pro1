import { Link, useNavigate } from "react-router-dom";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";

const modeLabelMap: Record<string, string> = {
  serial: "Web Serial",
  demo: "DEMO",
};

const formatDuration = (seconds: number) => {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

const wearLabel = {
  worn: "착용 중",
  unstable: "불안정",
  not_worn: "미착용",
} as const;

const signalLabel = {
  good: "좋음",
  normal: "보통",
  poor: "부족",
} as const;

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="fx2-surface rounded-2xl p-4 transition-shadow hover:shadow-md">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-[#111827] dark:text-white">
        {value}
      </p>
    </div>
  );
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.ceil(bytes / 1024)}KB`;
};

const formatMs = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

export default function SummaryPage() {
  const navigate = useNavigate();
  const {
    state,
    summary,
    selectedMode,
    startSession,
    recorderSummary,
    exportCsv,
    exportJson,
  } = useFx2RealtimeSession();

  const averageBpm = summary.averageHeartRate || state.heartRate;
  const minBpm = state.stats.minHeartRate || state.heartRate;
  const maxBpm = state.stats.maxHeartRate || state.heartRate;

  const validRr = state.rrInterval.filter((r) => r > 0);
  let minRr = 0;
  let maxRr = 0;
  let sumRr = 0;
  for (let i = 0; i < validRr.length; i++) {
    const v = validRr[i];
    if (i === 0 || v < minRr) minRr = v;
    if (i === 0 || v > maxRr) maxRr = v;
    sumRr += v;
  }
  const avgRr = validRr.length > 0 ? Math.round(sumRr / validRr.length) : 0;

  const hrv = (() => {
    if (validRr.length < 2) return null;
    const n = validRr.length;
    const mean = sumRr / n;
    let varSum = 0;
    let sqDiffSum = 0;
    let nn50 = 0;
    for (let i = 0; i < n; i++) {
      varSum += (validRr[i] - mean) ** 2;
      if (i > 0) {
        const diff = validRr[i] - validRr[i - 1];
        sqDiffSum += diff * diff;
        if (Math.abs(diff) > 50) nn50++;
      }
    }
    return {
      sdnn: Math.round(Math.sqrt(varSum / (n - 1)) * 10) / 10,
      rmssd: Math.round(Math.sqrt(sqDiffSum / (n - 1)) * 10) / 10,
      pnn50: Math.round((nn50 / (n - 1)) * 100 * 10) / 10,
    };
  })();

  const fftBands = (() => {
    const hist = state.fftBandHistory;
    if (hist.length === 0) return null;
    let t = 0, a = 0, b = 0, ch1A = 0, ch2A = 0;
    for (const e of hist) { t += e.theta; a += e.alpha; b += e.beta; ch1A += e.ch1Alpha; ch2A += e.ch2Alpha; }
    const n = hist.length;
    const rawT = t / n, rawA = a / n, rawB = b / n;
    const base = t + a + b;
    if (!base) return null;
    const tp = (t / base) * 100, ap = (a / base) * 100, bp = (b / base) * 100;
    const m: [string, number][] = [["세타", tp], ["알파", ap], ["베타", bp]];
    m.sort((x, y) => y[1] - x[1]);
    const dom = m[0][1] - m[1][1] < 5 ? "혼합" : m[0][0];
    const alphaSum = ch1A + ch2A;
    const faa = alphaSum > 0 ? Math.round(((ch2A - ch1A) / alphaSum) * 1000) / 1000 : 0;
    const concentrationIdx = rawA > 0 ? Math.round((rawB / rawA) * 100) / 100 : 0;
    return { theta: tp, alpha: ap, beta: bp, dominant: dom, rawTheta: rawT, rawAlpha: rawA, rawBeta: rawB, faa, concentrationIdx };
  })();

  const handleRestart = () => {
    startSession();
    navigate("/live");
  };

  const hasData = state.stats.sampleCount > 0;

  if (!hasData) {
    return (
      <section
        aria-labelledby="empty-summary-title"
        className="fx2-card fx2-outline flex flex-col items-center justify-center gap-5 py-16 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF0F8] dark:bg-slate-800" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-[#6B7280] dark:text-slate-400">
            <path d="M9 17H7A5 5 0 0 1 7 7h2" />
            <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </div>
        <div>
          <p id="empty-summary-title" className="text-lg font-semibold text-[#111827] dark:text-white">
            아직 세션 데이터가 없습니다
          </p>
          <p className="mt-1 text-sm text-[#6B7280] dark:text-slate-400">
            측정을 시작하고 종료하면 이 페이지에서 요약을 확인할 수 있습니다.
          </p>
        </div>
        <Link to="/live" className="fx2-btn-primary !px-5 !py-2.5 !text-sm">
          실시간 측정 시작
        </Link>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <section aria-labelledby="summary-title" className="fx2-card fx2-outline lg:col-span-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2563EB]">
          Session Summary
        </p>
        <h2 id="summary-title" className="mt-3 text-3xl font-bold text-[#111827] dark:text-white">
          측정 요약
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[#6B7280] dark:text-slate-400">
          {summary.summaryText}
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-5">
          <SummaryMetric label="세션 시간" value={formatDuration(state.sessionSeconds)} />
          <SummaryMetric label="평균 BPM" value={`${averageBpm} bpm`} />
          <SummaryMetric label="최소 BPM" value={`${minBpm} bpm`} />
          <SummaryMetric label="최대 BPM" value={`${maxBpm} bpm`} />
          <SummaryMetric label="신호 안정도" value={`${summary.stabilityScore}%`} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="fx2-surface rounded-2xl border border-[#E5EBF4] p-4 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-[#111827] dark:text-white">
              채널 해석
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-[#6B7280] dark:text-slate-400">
              <li>
                좌측 채널 평균:{" "}
                <span className="font-semibold text-[#111827] dark:text-white">
                  {summary.leftChannelAverage}
                </span>
              </li>
              <li>
                우측 채널 평균:{" "}
                <span className="font-semibold text-[#111827] dark:text-white">
                  {summary.rightChannelAverage}
                </span>
              </li>
              <li>
                좌측 최대 진폭:{" "}
                <span className="font-semibold text-[#111827] dark:text-white">
                  {summary.leftPeak}
                </span>
              </li>
              <li>
                우측 최대 진폭:{" "}
                <span className="font-semibold text-[#111827] dark:text-white">
                  {summary.rightPeak}
                </span>
              </li>
            </ul>
          </div>

          <div className="fx2-surface rounded-2xl border border-[#E5EBF4] p-4 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-[#111827] dark:text-white">
              상태 해석
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-[#6B7280] dark:text-slate-400">
              <li>
                착용 상태:{" "}
                <span className="font-semibold text-[#111827] dark:text-white">
                  {wearLabel[state.wearStatus]}
                </span>
              </li>
              <li>
                신호 품질:{" "}
                <span className="font-semibold text-[#111827] dark:text-white">
                  {signalLabel[state.signalStatus]}
                </span>
              </li>
              <li>
                평균 신호 품질:{" "}
                <span className="font-semibold text-[#111827] dark:text-white">
                  {summary.signalQualityAverage || state.signalQuality}%
                </span>
              </li>
              <li>
                연결 끊김 횟수:{" "}
                <span className="font-semibold text-[#111827] dark:text-white">
                  {state.stats.connectionDrops}
                </span>
              </li>
            </ul>
          </div>

          {validRr.length > 0 ? (
            <div className="fx2-surface rounded-2xl border border-[#E5EBF4] p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-[#111827] dark:text-white">
                RR 간격 · HRV
              </h3>
              <ul className="mt-3 space-y-2 text-xs text-[#6B7280] dark:text-slate-400">
                <li>
                  평균 RR:{" "}
                  <span className="font-semibold text-[#111827] dark:text-white">
                    {avgRr} ms
                  </span>
                </li>
                <li>
                  최소 / 최대:{" "}
                  <span className="font-semibold text-[#111827] dark:text-white">
                    {minRr} / {maxRr} ms
                  </span>
                </li>
                {hrv ? (
                  <>
                    <li>
                      SDNN:{" "}
                      <span className="font-semibold text-[#111827] dark:text-white">
                        {hrv.sdnn} ms
                      </span>
                    </li>
                    <li>
                      RMSSD:{" "}
                      <span className="font-semibold text-[#111827] dark:text-white">
                        {hrv.rmssd} ms
                      </span>
                    </li>
                    <li>
                      pNN50:{" "}
                      <span className="font-semibold text-[#111827] dark:text-white">
                        {hrv.pnn50}%
                      </span>
                    </li>
                  </>
                ) : null}
                <li>
                  샘플 수:{" "}
                  <span className="font-semibold text-[#111827] dark:text-white">
                    {validRr.length.toLocaleString()}
                  </span>
                </li>
              </ul>
            </div>
          ) : null}
        </div>

        {/* FFT 대역 */}
        {fftBands ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-[#111827] dark:text-white mb-4">주파수 대역 분포</h3>
            <div className="flex items-end justify-center gap-6 h-40">
              {([
                { key: "theta" as const, label: "세타", sub: "4–8 Hz", color: "#8B5CF6" },
                { key: "alpha" as const, label: "알파", sub: "8–12 Hz", color: "#22C55E" },
                { key: "beta" as const, label: "베타", sub: "12–30 Hz", color: "#F59E0B" },
              ]).map(({ key, label, sub, color }) => (
                <div key={key} className="flex flex-col items-center gap-1 flex-1 max-w-[100px]">
                  <span className="text-sm font-bold text-[#111827] dark:text-white">{fftBands[key].toFixed(1)}%</span>
                  <div className="w-full rounded-t-lg" style={{ height: `${Math.max(fftBands[key] * 1.2, 8)}px`, backgroundColor: color }} />
                  <span className="text-xs font-semibold text-[#111827] dark:text-white mt-1">{label}</span>
                  <span className="text-[9px] text-[#9CA3AF] dark:text-slate-500">{sub}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-[#9CA3AF] dark:text-slate-500">
              <span>우세: <span className="font-semibold text-[#111827] dark:text-white">{fftBands.dominant}</span></span>
              <span>·</span>
              <span>{state.fftBandHistory.length} epochs</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#F8FAFC] p-3 dark:bg-slate-800/50 text-center">
                <p className="text-lg font-bold text-[#06B6D4]">{fftBands.faa > 0 ? "+" : ""}{fftBands.faa.toFixed(3)}</p>
                <p className="text-[10px] font-semibold text-[#6B7280] dark:text-slate-400 mt-1">FAA</p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] p-3 dark:bg-slate-800/50 text-center">
                <p className="text-lg font-bold text-[#F59E0B]">{fftBands.concentrationIdx.toFixed(2)}</p>
                <p className="text-[10px] font-semibold text-[#6B7280] dark:text-slate-400 mt-1">β/α</p>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="session-info-title" className="fx2-card fx2-outline lg:col-span-4">
        <h3 id="session-info-title" className="fx2-title mb-5">세션 정보</h3>
        <dl className="divide-y divide-[#E5EBF4] dark:divide-slate-700">
          <div className="flex items-center justify-between py-3 first:pt-0">
            <dt className="text-xs text-[#6B7280] dark:text-slate-400">장치 모드</dt>
            <dd className="text-xs font-semibold text-[#111827] dark:text-white">
              {modeLabelMap[selectedMode] ?? selectedMode.toUpperCase()}
            </dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-xs text-[#6B7280] dark:text-slate-400">마지막 심박수</dt>
            <dd className="text-xs font-semibold text-[#111827] dark:text-white">
              {state.heartRate} bpm
            </dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-xs text-[#6B7280] dark:text-slate-400">마지막 갱신</dt>
            <dd className="text-xs font-semibold text-[#111827] dark:text-white">
              {new Date(state.lastUpdated).toLocaleTimeString("ko-KR")}
            </dd>
          </div>
          {recorderSummary.startedAt ? (
            <div className="flex items-center justify-between py-3">
              <dt className="text-xs text-[#6B7280] dark:text-slate-400">세션 시작</dt>
              <dd className="text-xs font-semibold text-[#111827] dark:text-white">
                {new Date(recorderSummary.startedAt).toLocaleTimeString("ko-KR")}
              </dd>
            </div>
          ) : null}
          {recorderSummary.durationMs > 0 ? (
            <div className="flex items-center justify-between py-3 last:pb-0">
              <dt className="text-xs text-[#6B7280] dark:text-slate-400">녹화 시간</dt>
              <dd className="text-xs font-semibold text-[#111827] dark:text-white">
                {formatMs(recorderSummary.durationMs)}
              </dd>
            </div>
          ) : null}
        </dl>

        {recorderSummary.hasRecording ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/40 dark:bg-emerald-500/5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
              기록된 데이터
            </p>
            <p className="mt-1.5 text-xs text-[#6B7280] dark:text-slate-400">
              {recorderSummary.sampleCount.toLocaleString()}샘플 · 차트에서 사라진 데이터도 포함됩니다
            </p>
            <p className="mt-0.5 text-xs text-[#6B7280] dark:text-slate-300">
              CSV≈{formatBytes(recorderSummary.sampleCount * 100 + 600)} · JSON≈{formatBytes(recorderSummary.sampleCount * 160 + 200)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                CSV 저장
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                JSON 저장
              </button>
            </div>
          </div>
        ) : null}

        {/* 분석하러 가기 CTA */}
        <div className="mt-5 rounded-2xl border-2 border-violet-300 bg-violet-50 p-4 dark:border-violet-700 dark:bg-violet-500/10">
          <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">
            JSON을 저장한 뒤, 분석 페이지에서 업로드하면 뇌파 상태를 확인할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => { exportJson(); navigate("/analyze"); }}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-violet-700 hover:shadow-lg"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M14 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
              <path d="M10 2v4l2-1.5L14 6V2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 10h8M6 13h5" strokeLinecap="round" />
            </svg>
            분석하러 가기 (JSON 자동 저장)
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={handleRestart}
            className="fx2-btn-primary !py-2.5 !text-sm"
          >
            새 세션 시작
          </button>
          <Link to="/live" className="fx2-btn-secondary !py-2.5 !text-sm">
            실시간 화면으로
          </Link>
        </div>
      </section>
    </div>
  );
}
