import { Link } from "react-router-dom";
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
  poor: "나쁨",
} as const;

export default function SummaryPage() {
  const { state, summary, selectedMode } = useFx2RealtimeSession();

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">

      <section className="fx2-card lg:col-span-8">
        <h2 className="fx2-title mb-3">측정 요약</h2>
        <p className="mb-8 text-sm leading-7 text-[#6B7280]">{summary.summaryText}</p>

        {/* Metric tiles */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <div className="rounded-2xl bg-[#EAF0F8] p-4">
            <p className="text-xs text-[#6B7280]">세션 시간</p>
            <p className="mt-2 text-xl font-bold text-[#111827]">
              {formatDuration(state.sessionSeconds)}
            </p>
          </div>
          <div className="rounded-2xl bg-[#EAF0F8] p-4">
            <p className="text-xs text-[#6B7280]">평균 심박수</p>
            <p className="mt-2 text-xl font-bold text-[#111827]">
              {summary.averageHeartRate || state.heartRate} bpm
            </p>
          </div>
          <div className="rounded-2xl bg-[#EAF0F8] p-4">
            <p className="text-xs text-[#6B7280]">평균 신호 품질</p>
            <p className="mt-2 text-xl font-bold text-[#111827]">
              {summary.signalQualityAverage || state.signalQuality}%
            </p>
          </div>
          <div className="rounded-2xl bg-[#EAF0F8] p-4">
            <p className="text-xs text-[#6B7280]">좌측 채널 평균</p>
            <p className="mt-2 text-xl font-bold text-[#111827]">
              {summary.leftChannelAverage}
            </p>
          </div>
          <div className="rounded-2xl bg-[#EAF0F8] p-4">
            <p className="text-xs text-[#6B7280]">우측 채널 평균</p>
            <p className="mt-2 text-xl font-bold text-[#111827]">
              {summary.rightChannelAverage}
            </p>
          </div>
          <div className="rounded-2xl bg-[#EAF0F8] p-4">
            <p className="text-xs text-[#6B7280]">안정성 점수</p>
            <p className="mt-2 text-xl font-bold text-[#111827]">
              {summary.stabilityScore}/100
            </p>
          </div>
        </div>

        {/* Detail panels */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#EAF0F8] p-4">
            <h3 className="text-sm font-semibold text-[#111827]">채널 해석</h3>
            <ul className="mt-3 space-y-2">
              <li className="text-xs text-[#6B7280]">좌측 채널 최대 진폭: <span className="font-semibold text-[#111827]">{summary.leftPeak}</span></li>
              <li className="text-xs text-[#6B7280]">우측 채널 최대 진폭: <span className="font-semibold text-[#111827]">{summary.rightPeak}</span></li>
              <li className="text-xs text-[#6B7280]">좌우 평균 차이: <span className="font-semibold text-[#111827]">{summary.balanceGap}</span></li>
            </ul>
          </div>
          <div className="rounded-2xl bg-[#EAF0F8] p-4">
            <h3 className="text-sm font-semibold text-[#111827]">상태 해석</h3>
            <ul className="mt-3 space-y-2">
              <li className="text-xs text-[#6B7280]">착용 상태: <span className="font-semibold text-[#111827]">{wearLabel[state.wearStatus]}</span></li>
              <li className="text-xs text-[#6B7280]">신호 품질: <span className="font-semibold text-[#111827]">{signalLabel[state.signalStatus]}</span></li>
              <li className="text-xs text-[#6B7280]">연결 끊김 횟수: <span className="font-semibold text-[#111827]">{state.stats.connectionDrops}</span></li>
              <li className="text-xs text-[#6B7280]">미착용 감지 횟수: <span className="font-semibold text-[#111827]">{state.stats.notWornMoments}</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="fx2-card lg:col-span-4">
        <h3 className="fx2-title mb-5">세션 정보</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280]">장치 모드</span>
            <span className="text-xs font-semibold text-[#111827]">{selectedMode.toUpperCase()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280]">마지막 심박수</span>
            <span className="text-xs font-semibold text-[#111827]">{state.heartRate} bpm</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280]">마지막 갱신</span>
            <span className="text-xs font-semibold text-[#111827]">{new Date(state.lastUpdated).toLocaleTimeString()}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-2">
          <Link
            to="/live"
            className="rounded-xl bg-[#2563EB] px-4 py-2.5 text-center text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            실시간 화면으로 돌아가기
          </Link>
          <Link
            to="/"
            className="rounded-xl bg-[#EAF0F8] px-4 py-2.5 text-center text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white"
          >
            홈으로 이동
          </Link>
        </div>
      </section>

    </div>
  );
}
