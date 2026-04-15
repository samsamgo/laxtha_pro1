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
    selectedMode,
    sessionPhase,
    hardwareStatus,
    hardwareDetail,
    stopSession,
    disconnectHardware,
    pushManualUpdate,
    applyPreset,
  } = useFx2RealtimeSession();
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-5">

        {/* ── Row 1: Status cards (4 across) ── */}
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <StatusCard
            title="심박수"
            value={`${state.heartRate}`}
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
        </div>

        {/* ── Row 2: EEG Charts (side by side, full width together) ── */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <LineChartCard
            title="좌측 EEG (CH1)"
            subtitle="실시간 입력에 반응하는 좌측 채널 파형"
            values={state.ch1}
            color="#06B6D4"
          />
          <LineChartCard
            title="우측 EEG (CH2)"
            subtitle="실시간 입력에 반응하는 우측 채널 파형"
            values={state.ch2}
            color="#2563EB"
          />
        </div>

        {/* ── Row 3: Connection + Device info + Session insights ── */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-12">

          <section className="fx2-card sm:col-span-1 xl:col-span-3">
            <h2 className="fx2-title mb-4">연결 상태</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#6B7280]">세션 상태</span>
                <span className="text-xs font-semibold text-[#111827]">{sessionPhase}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#6B7280]">장치 모드</span>
                <span className="text-xs font-semibold text-[#111827]">{selectedMode.toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#6B7280]">하드웨어</span>
                <span className="text-xs font-semibold text-[#111827]">{hardwareLabelMap[hardwareStatus]}</span>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={disconnectHardware}
                className="rounded-xl bg-[#EAF0F8] px-3 py-2 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#2563EB] hover:text-white"
              >
                장치 연결 해제
              </button>
              <button
                type="button"
                onClick={stopSession}
                className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-[#EF4444] transition-colors duration-200 hover:bg-[#EF4444] hover:text-white"
              >
                측정 종료
              </button>
            </div>
          </section>

          <section className="fx2-card sm:col-span-1 xl:col-span-3">
            <h2 className="fx2-title mb-4">장치 정보</h2>
            <div className="rounded-2xl bg-[#EAF0F8] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
                Mode
              </p>
              <p className="mt-1.5 text-sm font-semibold text-[#111827]">
                {selectedMode.toUpperCase()}
              </p>
              {hardwareDetail ? (
                <p className="mt-2 text-xs leading-5 text-[#6B7280]">{hardwareDetail}</p>
              ) : null}
            </div>
          </section>

          <section className="fx2-card sm:col-span-2 xl:col-span-6">
            <h2 className="fx2-title mb-4">세션 인사이트</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#EAF0F8] p-4">
                <p className="text-xs text-[#6B7280]">좌우 채널 평균 차이</p>
                <p className="mt-2 text-2xl font-bold text-[#111827]">{summary.balanceGap}</p>
              </div>
              <div className="rounded-2xl bg-[#EAF0F8] p-4">
                <p className="text-xs text-[#6B7280]">안정성 점수</p>
                <p className="mt-2 text-2xl font-bold text-[#111827]">{summary.stabilityScore}/100</p>
              </div>
              <div className="rounded-2xl bg-[#EAF0F8] p-4">
                <p className="text-xs text-[#6B7280]">연결 끊김 횟수</p>
                <p className="mt-2 text-2xl font-bold text-[#111827]">{state.stats.connectionDrops}</p>
              </div>
              <div className="rounded-2xl bg-[#EAF0F8] p-4">
                <p className="text-xs text-[#6B7280]">미착용 감지</p>
                <p className="mt-2 text-2xl font-bold text-[#111827]">{state.stats.notWornMoments}</p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-6 text-[#6B7280]">{summary.summaryText}</p>
          </section>

        </div>

        {/* ── Row 4: Demo control + Event log ── */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

          <section className="fx2-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="fx2-title">데모 제어</h2>
              <button
                type="button"
                onClick={() => setPanelOpen((prev) => !prev)}
                className="rounded-full bg-[#EAF0F8] px-4 py-1.5 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#2563EB] hover:text-white"
              >
                {panelOpen ? "패널 숨기기" : "패널 열기"}
              </button>
            </div>
            <p className="mb-4 text-xs text-[#6B7280]">
              웹 단독으로 차트와 상태를 검증할 수 있는 제어 패널입니다.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => applyPreset("balanced")}
                className="rounded-xl bg-[#2563EB] px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                안정 측정
              </button>
              <button
                type="button"
                onClick={() => applyPreset("weakSignal")}
                className="rounded-xl bg-[#06B6D4] px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                약한 신호
              </button>
              <button
                type="button"
                onClick={() => applyPreset("notWorn")}
                className="rounded-xl bg-[#F59E0B] px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                미착용
              </button>
              <button
                type="button"
                onClick={() => applyPreset("disconnected")}
                className="rounded-xl bg-[#EF4444] px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
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
              className="mt-2 w-full rounded-xl bg-[#EAF0F8] px-3 py-2.5 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white"
            >
              연결 상태 토글
            </button>
          </section>

          <section className="fx2-card">
            <h2 className="fx2-title mb-4">이벤트 로그</h2>
            <ul className="space-y-2">
              {state.logs
                .slice()
                .reverse()
                .slice(0, 8)
                .map((log) => (
                  <li
                    key={`${log}-${state.lastUpdated}`}
                    className="rounded-2xl bg-[#EAF0F8] px-3 py-2 text-xs text-[#6B7280]"
                  >
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
        onPatch={(patch) => pushManualUpdate(patch)}
        onApplyPreset={applyPreset}
      />
    </>
  );
}
