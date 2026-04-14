import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import HiddenDemoPanel from "../components/HiddenDemoPanel";
import LineChartCard from "../components/LineChartCard";
import StatusCard from "../components/StatusCard";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";

const formatDuration = (seconds: number) => {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

export default function LivePage() {
  const {
    state,
    summary,
    connectionStatus,
    sessionSource,
    sessionPhase,
    websocketUrl,
    hasRemoteData,
    stopSession,
    reconnectRemote,
    pushManualUpdate,
    applyPreset
  } = useFx2RealtimeSession();
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && event.key.toLowerCase() === "d") {
        setPanelOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <div className="grid grid-cols-1 gap-6">
        <section className="rounded-[30px] border border-white/70 bg-white/85 p-6 shadow-card md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-fx2-primary">
                {sessionSource === "remote" ? "Remote Session" : "Local Demo Session"}
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-950">
                실시간 측정 대시보드
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-fx2-muted">
                좌우 EEG, 심박수, 착용 상태, 연결 상태를 한 화면에서 읽을 수 있도록 구성했습니다.
                {sessionSource === "remote"
                  ? " 앱 리모컨이 연결되면 같은 값을 실시간으로 받아옵니다."
                  : " 내장 데모 모드에서는 웹 단독으로 흐름을 재현합니다."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fx2-muted">세션 시간</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{formatDuration(state.sessionSeconds)}</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fx2-muted">연결 상태</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{connectionStatus}</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fx2-muted">안정 점수</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{summary.stabilityScore}/100</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fx2-muted">데이터 흐름</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{sessionPhase}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setPanelOpen((prev) => !prev)}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            >
              숨은 데모 패널 {panelOpen ? "숨기기" : "열기"}
            </button>
            <button
              type="button"
              onClick={reconnectRemote}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-fx2-text"
            >
              WebSocket 재연결
            </button>
            <button
              type="button"
              onClick={stopSession}
              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600"
            >
              측정 종료
            </button>
            <Link
              to="/summary"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-fx2-text"
            >
              결과 요약 보기
            </Link>
            <span className="text-sm text-fx2-muted">패널 단축키: Shift + D</span>
          </div>

          {sessionSource === "remote" ? (
            <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 text-sm text-fx2-muted">
              <p className="font-semibold text-slate-950">현재 브리지 주소</p>
              <p className="mt-1 break-all">{websocketUrl}</p>
              <p className="mt-2">
                {hasRemoteData
                  ? "앱 또는 다른 클라이언트에서 들어온 실시간 값을 수신 중입니다."
                  : "아직 원격 데이터가 들어오지 않았습니다. 앱에서 연결을 시작하거나 숨은 패널로 먼저 값 검증을 해볼 수 있습니다."}
              </p>
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-cardGap xl:grid-cols-dashboard">
          <LineChartCard
            title="좌뇌 EEG"
            values={state.ch1}
            color="#2563EB"
            subtitle="시연용 좌측 채널 실시간 파형"
          />
          <LineChartCard
            title="우뇌 EEG"
            values={state.ch2}
            color="#06B6D4"
            subtitle="시연용 우측 채널 실시간 파형"
          />

          <StatusCard
            title="심박수"
            value={`${state.heartRate} bpm`}
            hint={`세션 평균 ${summary.averageHeartRate || state.heartRate} bpm`}
            tone="primary"
          />
          <StatusCard
            title="착용 상태"
            value={state.wearStatus === "worn" ? "안정 착용" : state.wearStatus === "unstable" ? "불안정" : "미착용"}
            hint="센서 접촉 안정성 판단"
            tone={state.wearStatus === "worn" ? "success" : state.wearStatus === "unstable" ? "warning" : "danger"}
          />
          <StatusCard
            title="신호 품질"
            value={`${state.signalQuality}%`}
            hint={`세션 평균 ${summary.signalQualityAverage || state.signalQuality}%`}
            tone={state.signalStatus === "good" ? "success" : state.signalStatus === "normal" ? "warning" : "danger"}
          />
          <StatusCard
            title="연결 상태"
            value={state.connected ? "Connected" : "Disconnected"}
            hint={`socket: ${connectionStatus}`}
            tone={state.connected ? "success" : "danger"}
          />

          <section className="fx2-card col-span-12 xl:col-span-6">
            <h2 className="fx2-title mb-4">세션 인사이트</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-[22px] bg-slate-50 p-4">
                <p className="text-sm text-fx2-muted">좌우 밸런스 차이</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.balanceGap}</p>
              </div>
              <div className="rounded-[22px] bg-slate-50 p-4">
                <p className="text-sm text-fx2-muted">연결 드롭 횟수</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{state.stats.connectionDrops}</p>
              </div>
              <div className="rounded-[22px] bg-slate-50 p-4">
                <p className="text-sm text-fx2-muted">불안정 순간</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{state.stats.unstableMoments}</p>
              </div>
              <div className="rounded-[22px] bg-slate-50 p-4">
                <p className="text-sm text-fx2-muted">미착용 순간</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{state.stats.notWornMoments}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-fx2-muted">{summary.summaryText}</p>
          </section>

          <section className="fx2-card col-span-12 xl:col-span-6">
            <h2 className="fx2-title mb-4">이벤트 로그</h2>
            <ul className="space-y-2 text-sm text-fx2-muted">
              {state.logs
                .slice()
                .reverse()
                .slice(0, 10)
                .map((log) => (
                  <li key={`${log}-${state.lastUpdated}`} className="rounded-2xl bg-slate-50 px-3 py-3">
                    {log}
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </div>

      <HiddenDemoPanel
        open={panelOpen}
        state={state}
        onClose={() => setPanelOpen(false)}
        onPatch={(patch) => {
          pushManualUpdate(patch);
        }}
        onApplyPreset={applyPreset}
      />
    </>
  );
}
