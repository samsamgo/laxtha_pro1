import { Link, useNavigate } from "react-router-dom";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";
import { openLaxthaGpt } from "../lib/external";

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
                RR 간격 (HRV)
              </h3>
              <ul className="mt-3 space-y-2 text-xs text-[#6B7280] dark:text-slate-400">
                <li>
                  평균 RR:{" "}
                  <span className="font-semibold text-[#111827] dark:text-white">
                    {avgRr} ms
                  </span>
                </li>
                <li>
                  최소 RR:{" "}
                  <span className="font-semibold text-[#111827] dark:text-white">
                    {minRr} ms
                  </span>
                </li>
                <li>
                  최대 RR:{" "}
                  <span className="font-semibold text-[#111827] dark:text-white">
                    {maxRr} ms
                  </span>
                </li>
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
          <>
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/40 dark:bg-emerald-500/5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
                기록된 데이터
              </p>
              <p className="mt-1.5 text-xs text-[#6B7280] dark:text-slate-400">
                {recorderSummary.sampleCount.toLocaleString()}샘플 · 차트에서 사라진 데이터도 포함됩니다
              </p>
              <p className="mt-0.5 text-xs text-[#9CA3AF] dark:text-slate-500">
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

            <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-800/40 dark:bg-violet-500/5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-700 dark:text-violet-300">
                AI 분석 · ChatGPT
              </p>
              <p className="mt-1.5 text-sm font-semibold text-[#111827] dark:text-white">
                🤖 LAXTHA 뇌파 브리핑
              </p>
              <p className="mt-1 text-xs leading-5 text-[#6B7280] dark:text-slate-400">
                JSON을 GPT에 올리면 측정 결과를 친근하게 풀어 설명해 드려요. (의료 진단 아님)
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openLaxthaGpt();
                    exportJson();
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  aria-label="JSON을 다운로드하고 LAXTHA 뇌파 브리핑 GPT를 새 탭에서 열기"
                >
                  🤖 GPT로 분석
                </button>
                <button
                  type="button"
                  onClick={openLaxthaGpt}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#EAF0F8] px-3 py-2 text-xs font-semibold text-[#374151] transition-colors duration-200 hover:bg-[#111827] hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  aria-label="LAXTHA 뇌파 브리핑 GPT만 새 탭에서 열기"
                >
                  GPT만 열기
                </button>
              </div>
            </div>
          </>
        ) : null}

        <div className="mt-6 grid gap-2">
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
