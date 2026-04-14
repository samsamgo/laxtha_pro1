import { useState } from "react";
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

const wearLabel = {
  worn: "안정적",
  unstable: "불안정",
  not_worn: "미착용",
} as const;

const signalLabel = {
  good: "좋음",
  normal: "보통",
  poor: "나쁨",
} as const;

const hardwareLabelMap = {
  idle: "장치 대기",
  requesting: "권한 요청",
  connecting: "장치 연결 중",
  connected: "장치 연결됨",
  unsupported: "브라우저 미지원",
  error: "장치 오류",
} as const;

export default function LivePage() {
  const {
    state,
    summary,
    connectionStatus,
    sessionSource,
    sessionPhase,
    websocketUrl,
    hardwareStatus,
    hardwareDetail,
    hasRemoteData,
    stopSession,
    reconnectRemote,
    disconnectHardware,
    pushManualUpdate,
    applyPreset,
  } = useFx2RealtimeSession();
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 gap-cardGap xl:grid-cols-dashboard">
        <LineChartCard
          title="좌측 EEG (CH1)"
          subtitle="실시간 입력에 반응하는 좌측 채널 파형"
          values={state.ch1}
          color="#2563EB"
        />
        <LineChartCard
          title="우측 EEG (CH2)"
          subtitle="실시간 입력에 반응하는 우측 채널 파형"
          values={state.ch2}
          color="#06B6D4"
        />

        <StatusCard
          title="심박수"
          value={`${state.heartRate} bpm`}
          hint={`평균 ${summary.averageHeartRate || state.heartRate} bpm`}
          tone="primary"
        />
        <StatusCard
          title="착용 상태"
          value={wearLabel[state.wearStatus]}
          hint="센서 밀착 상태 기준"
          tone={
            state.wearStatus === "worn"
              ? "success"
              : state.wearStatus === "unstable"
              ? "warning"
              : "danger"
          }
        />
        <StatusCard
          title="신호 품질"
          value={`${state.signalQuality}%`}
          hint={signalLabel[state.signalStatus]}
          tone={
            state.signalStatus === "good"
              ? "success"
              : state.signalStatus === "normal"
              ? "warning"
              : "danger"
          }
        />
        <StatusCard
          title="세션 시간"
          value={formatDuration(state.sessionSeconds)}
          hint={`업데이트 ${new Date(state.lastUpdated).toLocaleTimeString()}`}
        />

        <section className="fx2-card col-span-12 sm:col-span-6 xl:col-span-3">
          <h2 className="fx2-title mb-4">연결 상태</h2>
          <div className="space-y-3 text-sm text-fx2-muted">
            <p className="flex justify-between">
              <span>세션 상태</span>
              <strong className="text-fx2-text">{sessionPhase}</strong>
            </p>
            <p className="flex justify-between">
              <span>WebSocket</span>
              <strong className="text-fx2-text">{connectionStatus}</strong>
            </p>
            <p className="flex justify-between">
              <span>하드웨어</span>
              <strong className="text-fx2-text">
                {sessionSource === "remote"
                  ? `${state.mode.toUpperCase()} 시나리오 수신`
                  : hardwareLabelMap[hardwareStatus]}
              </strong>
            </p>
            <p className="flex justify-between">
              <span>동기화 범위</span>
              <strong className="text-fx2-text">
                {sessionSource === "remote" ? "앱/웹 동기화" : "로컬 전용"}
              </strong>
            </p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2">
            {sessionSource === "remote" ? (
              <button
                type="button"
                onClick={reconnectRemote}
                className="rounded-xl bg-fx2-primary px-3 py-2 text-sm font-semibold text-white"
              >
                브리지 재연결
              </button>
            ) : (
              <button
                type="button"
                onClick={disconnectHardware}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-fx2-text"
              >
                장치 연결 해제
              </button>
            )}
            <button
              type="button"
              onClick={stopSession}
              className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600"
            >
              측정 종료
            </button>
          </div>
        </section>

        <section className="fx2-card col-span-12 sm:col-span-6 xl:col-span-3">
          <h2 className="fx2-title mb-4">입력 소스</h2>
          <p className="text-sm leading-7 text-fx2-muted">
            {sessionSource === "remote"
              ? hasRemoteData
                ? `앱에서 보낸 ${state.mode.toUpperCase()} 시나리오 값이 실시간으로 반영되고 있습니다.`
                : "브리지 연결 후 앱에서 첫 값을 보내면 차트가 즉시 반응합니다."
              : "현재 브라우저 안에서만 값을 처리하고 있습니다."}
          </p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-fx2-muted">
              Endpoint
            </p>
            <p className="mt-2 break-all text-sm text-fx2-text">
              {websocketUrl}
            </p>
            {hardwareDetail ? (
              <p className="mt-3 text-xs leading-6 text-fx2-muted">
                {hardwareDetail}
              </p>
            ) : null}
          </div>
        </section>

        <section className="fx2-card col-span-12 xl:col-span-6">
          <h2 className="fx2-title mb-4">세션 인사이트</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="fx2-muted">좌우 채널 평균 차이</p>
              <p className="mt-2 text-2xl font-semibold text-fx2-text">
                {summary.balanceGap}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="fx2-muted">안정성 점수</p>
              <p className="mt-2 text-2xl font-semibold text-fx2-text">
                {summary.stabilityScore}/100
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="fx2-muted">연결 끊김 횟수</p>
              <p className="mt-2 text-2xl font-semibold text-fx2-text">
                {state.stats.connectionDrops}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="fx2-muted">미착용 감지</p>
              <p className="mt-2 text-2xl font-semibold text-fx2-text">
                {state.stats.notWornMoments}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-7 text-fx2-muted">
            {summary.summaryText}
          </p>
        </section>

        <section className="fx2-card col-span-12 xl:col-span-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="fx2-title">
              {sessionSource === "remote" ? "보조 데모 제어" : "데모 제어"}
            </h2>
            <button
              type="button"
              onClick={() => setPanelOpen((prev) => !prev)}
              className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-fx2-text"
            >
              {panelOpen ? "패널 숨기기" : "패널 열기"}
            </button>
          </div>
          <p className="mb-4 text-sm leading-6 text-fx2-muted">
            {sessionSource === "remote"
              ? "앱 연결이 잠시 없을 때 웹에서 상태를 빠르게 검증할 수 있는 보조 패널입니다."
              : "웹 단독으로 차트와 상태를 검증할 수 있는 제어 패널입니다."}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => applyPreset("balanced")}
              className="rounded-xl bg-fx2-primary px-3 py-3 text-sm font-semibold text-white"
            >
              안정 측정
            </button>
            <button
              type="button"
              onClick={() => applyPreset("weakSignal")}
              className="rounded-xl bg-fx2-secondary px-3 py-3 text-sm font-semibold text-white"
            >
              약한 신호
            </button>
            <button
              type="button"
              onClick={() => applyPreset("notWorn")}
              className="rounded-xl bg-amber-500 px-3 py-3 text-sm font-semibold text-slate-950"
            >
              미착용
            </button>
            <button
              type="button"
              onClick={() => applyPreset("disconnected")}
              className="rounded-xl bg-rose-500 px-3 py-3 text-sm font-semibold text-white"
            >
              연결 끊김
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              pushManualUpdate({
                connection: state.connected ? "disconnected" : "connected",
              })
            }
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-fx2-text"
          >
            연결 상태 토글
          </button>
        </section>

        <section className="fx2-card col-span-12">
          <h2 className="fx2-title mb-4">이벤트 로그</h2>
          <ul className="space-y-2 text-sm text-fx2-muted">
            {state.logs
              .slice()
              .reverse()
              .slice(0, 10)
              .map((log) => (
                <li key={`${log}-${state.lastUpdated}`} className="rounded-xl bg-slate-50 px-3 py-2">
                  {log}
                </li>
              ))}
          </ul>
        </section>
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
