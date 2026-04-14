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
  const { state, summary, sessionSource, selectedMode } =
    useFx2RealtimeSession();

  return (
    <div className="grid grid-cols-1 gap-cardGap lg:grid-cols-12">
      <section className="fx2-card lg:col-span-8">
        <h2 className="fx2-title mb-4">측정 요약</h2>
        <p className="mb-8 text-lg leading-relaxed text-fx2-text">
          {summary.summaryText}
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="fx2-muted">세션 시간</p>
            <p className="mt-2 text-xl font-semibold">
              {formatDuration(state.sessionSeconds)}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="fx2-muted">평균 심박수</p>
            <p className="mt-2 text-xl font-semibold">
              {summary.averageHeartRate || state.heartRate} bpm
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="fx2-muted">평균 신호 품질</p>
            <p className="mt-2 text-xl font-semibold">
              {summary.signalQualityAverage || state.signalQuality}%
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="fx2-muted">좌측 채널 평균</p>
            <p className="mt-2 text-xl font-semibold">
              {summary.leftChannelAverage}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="fx2-muted">우측 채널 평균</p>
            <p className="mt-2 text-xl font-semibold">
              {summary.rightChannelAverage}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="fx2-muted">안정성 점수</p>
            <p className="mt-2 text-xl font-semibold">
              {summary.stabilityScore}/100
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-base font-semibold text-fx2-text">
              채널 해석
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-fx2-muted">
              <li>좌측 채널 최대 진폭: {summary.leftPeak}</li>
              <li>우측 채널 최대 진폭: {summary.rightPeak}</li>
              <li>좌우 평균 차이: {summary.balanceGap}</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-base font-semibold text-fx2-text">
              상태 해석
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-fx2-muted">
              <li>착용 상태: {wearLabel[state.wearStatus]}</li>
              <li>신호 품질: {signalLabel[state.signalStatus]}</li>
              <li>연결 끊김 횟수: {state.stats.connectionDrops}</li>
              <li>미착용 감지 횟수: {state.stats.notWornMoments}</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="fx2-card lg:col-span-4">
        <h3 className="fx2-title mb-4">세션 정보</h3>
        <div className="space-y-3 text-sm">
          <p className="flex justify-between">
            <span className="text-fx2-muted">모드</span>
            <strong>{selectedMode.toUpperCase()}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-fx2-muted">동기화 범위</span>
            <strong>{sessionSource === "remote" ? "앱/웹 동기화" : "로컬 전용"}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-fx2-muted">마지막 심박수</span>
            <strong>{state.heartRate} bpm</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-fx2-muted">마지막 갱신</span>
            <strong>{new Date(state.lastUpdated).toLocaleTimeString()}</strong>
          </p>
        </div>

        <div className="mt-6 grid gap-2">
          <Link
            to="/live"
            className="rounded-xl bg-fx2-primary px-4 py-3 text-center text-sm font-semibold text-white"
          >
            실시간 화면으로 돌아가기
          </Link>
          <Link
            to="/"
            className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-fx2-text"
          >
            홈으로 이동
          </Link>
        </div>
      </section>
    </div>
  );
}
