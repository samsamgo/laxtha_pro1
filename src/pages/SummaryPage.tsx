import { Link } from "react-router-dom";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";

const formatDuration = (seconds: number) => {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

export default function SummaryPage() {
  const { state, summary, sessionSource } = useFx2RealtimeSession();

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-[30px] border border-white/70 bg-white/85 p-6 shadow-card md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fx2-primary">Session Summary</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">측정 요약과 시연 해석</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-fx2-muted">
          {summary.summaryText} 이 요약은 현재 세션 동안 누적된 심박수, 신호 품질, 좌우 채널 흐름을 바탕으로 계산했습니다.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-[24px] bg-slate-50 p-5">
            <p className="text-sm text-fx2-muted">세션 시간</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{formatDuration(state.sessionSeconds)}</p>
          </div>
          <div className="rounded-[24px] bg-slate-50 p-5">
            <p className="text-sm text-fx2-muted">평균 심박수</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.averageHeartRate || state.heartRate} bpm</p>
          </div>
          <div className="rounded-[24px] bg-slate-50 p-5">
            <p className="text-sm text-fx2-muted">평균 신호 품질</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.signalQualityAverage || state.signalQuality}%</p>
          </div>
          <div className="rounded-[24px] bg-slate-50 p-5">
            <p className="text-sm text-fx2-muted">좌측 채널 평균</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.leftChannelAverage}</p>
          </div>
          <div className="rounded-[24px] bg-slate-50 p-5">
            <p className="text-sm text-fx2-muted">우측 채널 평균</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.rightChannelAverage}</p>
          </div>
          <div className="rounded-[24px] bg-slate-50 p-5">
            <p className="text-sm text-fx2-muted">안정 점수</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.stabilityScore}/100</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[26px] border border-slate-200 p-5">
            <h3 className="text-lg font-semibold text-slate-950">좌 / 우 채널 해석</h3>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-fx2-muted">
              <li>좌측 채널 최고 진폭은 {summary.leftPeak} 입니다.</li>
              <li>우측 채널 최고 진폭은 {summary.rightPeak} 입니다.</li>
              <li>좌우 평균 차이는 {summary.balanceGap} 로, 값이 작을수록 시연상 더 안정적으로 보입니다.</li>
            </ul>
          </div>
          <div className="rounded-[26px] border border-slate-200 p-5">
            <h3 className="text-lg font-semibold text-slate-950">상태 해석</h3>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-fx2-muted">
              <li>연결 드롭 횟수: {state.stats.connectionDrops}</li>
              <li>불안정 순간: {state.stats.unstableMoments}</li>
              <li>미착용 순간: {state.stats.notWornMoments}</li>
              <li>현재 세션 소스: {sessionSource === "remote" ? "앱 리모컨 / WebSocket" : "웹 내장 데모"}</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/live" className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
            실시간 화면으로 돌아가기
          </Link>
          <Link to="/" className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-fx2-text">
            시작 화면 보기
          </Link>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="fx2-card">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fx2-primary">현재 세션 상태</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-fx2-muted">연결 상태</span>
              <strong>{state.connected ? "연결됨" : "대기 / 종료"}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fx2-muted">착용 상태</span>
              <strong>{state.wearStatus}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fx2-muted">신호 등급</span>
              <strong>{state.signalStatus}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fx2-muted">마지막 갱신</span>
              <strong>{new Date(state.lastUpdated).toLocaleTimeString()}</strong>
            </div>
          </div>
        </section>

        <section className="fx2-card">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fx2-primary">추천 시연 멘트</p>
          <p className="mt-4 text-sm leading-7 text-fx2-muted">
            지금 보시는 화면은 센서 착용 여부, 신호 품질, 심박수, 좌우 채널 흐름을 동시에 읽을 수 있도록 정리된
            시연용 대시보드입니다. 앱에서 값을 조절하면 웹 결과가 바로 반영되고, 요약 화면에서도 세션 해석을 이어서
            확인할 수 있습니다.
          </p>
        </section>
      </aside>
    </div>
  );
}
