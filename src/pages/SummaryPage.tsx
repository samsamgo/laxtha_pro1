import { Link, useNavigate } from "react-router-dom";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";

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

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="fx2-surface rounded-2xl p-4">
      <p className="text-xs uppercase tracking-wide text-[#6B7280] dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-[#111827] dark:text-white">{value}</p>
    </div>
  );
}

export default function SummaryPage() {
  const navigate = useNavigate();
  const { state, summary, selectedMode, startSession } = useFx2RealtimeSession();

  const averageBpm = summary.averageHeartRate || state.heartRate;
  const minBpm = state.stats.minHeartRate || state.heartRate;
  const maxBpm = state.stats.maxHeartRate || state.heartRate;

  const handleRestart = () => {
    startSession();
    navigate("/live");
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <section className="fx2-card fx2-outline lg:col-span-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2563EB]">
          Session Summary
        </p>
        <h2 className="mt-3 text-3xl font-bold text-[#111827] dark:text-white">
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

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="fx2-surface rounded-2xl p-4">
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

          <div className="fx2-surface rounded-2xl p-4">
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
        </div>
      </section>

      <section className="fx2-card fx2-outline lg:col-span-4">
        <h3 className="fx2-title mb-5">세션 정보</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280] dark:text-slate-400">장치 모드</span>
            <span className="text-xs font-semibold text-[#111827] dark:text-white">
              {selectedMode.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280] dark:text-slate-400">마지막 심박수</span>
            <span className="text-xs font-semibold text-[#111827] dark:text-white">
              {state.heartRate} bpm
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280] dark:text-slate-400">마지막 갱신</span>
            <span className="text-xs font-semibold text-[#111827] dark:text-white">
              {new Date(state.lastUpdated).toLocaleTimeString("ko-KR")}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={handleRestart}
            className="rounded-xl bg-[#2563EB] px-4 py-2.5 text-center text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            새 세션 시작
          </button>
          <Link
            to="/"
            className="rounded-xl bg-[#EAF0F8] px-4 py-2.5 text-center text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            홈으로
          </Link>
        </div>
      </section>
    </div>
  );
}
