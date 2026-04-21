import { useState } from "react";
import EEGChartV2 from "../components/EEGChartV2";
import HiddenDemoPanel from "../components/HiddenDemoPanel";
import StatusCard from "../components/StatusCard";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";
import type { Fx2HardwareStatus } from "../services/fx2Hardware";

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

const hwStatusConfig: Record<Fx2HardwareStatus, { dot: string; label: string }> = {
  connected:   { dot: "bg-green-500",               label: "연결됨"    },
  connecting:  { dot: "bg-yellow-400 animate-pulse", label: "연결 중..." },
  requesting:  { dot: "bg-yellow-400 animate-pulse", label: "연결 중..." },
  idle:        { dot: "bg-gray-400",                 label: "대기 중"   },
  error:       { dot: "bg-red-500",                  label: "연결 오류" },
  unsupported: { dot: "bg-red-500",                  label: "미지원"    },
};

function HardwareStatusDot({ status }: { status: Fx2HardwareStatus }) {
  const { dot, label } = hwStatusConfig[status];
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span className="text-xs font-semibold text-[#111827]">{label}</span>
    </span>
  );
}

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
  const [windowSeconds, setWindowSeconds] = useState<10 | 30 | 60>(30);
  const [paused, setPaused] = useState(false);
  const [ch1Visible, setCh1Visible] = useState(true);
  const [ch2Visible, setCh2Visible] = useState(true);
  const [chartTheme, setChartTheme] = useState<"light" | "dark">("light");

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

        {/* ── Row 2: Combined EEG Chart (full width) ── */}
        <EEGChartV2
          ch1={state.ch1}
          ch2={state.ch2}
          timestamps={state.timestamps}
          mode={selectedMode}
          windowSeconds={windowSeconds}
          paused={paused}
          ch1Visible={ch1Visible}
          ch2Visible={ch2Visible}
          theme={chartTheme}
          onPauseToggle={() => setPaused((current) => !current)}
          onWindowChange={setWindowSeconds}
          onCh1Toggle={() => setCh1Visible((current) => !current)}
          onCh2Toggle={() => setCh2Visible((current) => !current)}
          onThemeToggle={() =>
            setChartTheme((current) => (current === "light" ? "dark" : "light"))
          }
        />

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
                <HardwareStatusDot status={hardwareStatus} />
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
