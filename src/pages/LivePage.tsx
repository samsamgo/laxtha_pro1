import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EEGChartV2 from "../components/EEGChartV2";
import HiddenDemoPanel from "../components/HiddenDemoPanel";
import LineChartCard from "../components/LineChartCard";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";
import { useFx2Theme } from "../context/ThemeContext";
import { useEegSessionRecorder } from "../hooks/useEegSessionRecorder";
import type { ExtWindowSeconds } from "../types/eegRecorder";

const formatDuration = (seconds: number) => {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

const formatMs = (ms: number) => {
  const totalSec = Math.floor(ms / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

const wearLabel = {
  worn: "안정 착용",
  unstable: "불안정",
  not_worn: "미착용",
} as const;

const signalLabel = {
  good: "좋음",
  normal: "보통",
  poor: "부족",
} as const;

// Max points passed to chart per window — display buffer only, not recording
const chartPointLimitMap: Record<ExtWindowSeconds, number> = {
  5: 50,
  10: 100,
  30: 300,
  60: 600,
  120: 1200,
  300: 3000,
};

function HeartIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M10 17.1 8.6 15.8C4.1 11.7 1 8.9 1 5.5 1 3 3 1 5.5 1c1.4 0 2.7.6 3.5 1.7C9.8 1.6 11.1 1 12.5 1 15 1 17 3 17 5.5c0 3.4-3.1 6.2-7.6 10.3L10 17.1Z" />
    </svg>
  );
}

function WearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4 11c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M6 11v3a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3" />
      <path d="M8 8h4" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M3 14h2l2-4 3 6 2-4h5" />
      <path d="M3 6h14" opacity="0.25" />
    </svg>
  );
}

function TimeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" />
    </svg>
  );
}

interface CompactStatusItemProps {
  icon: ReactNode;
  label: string;
  value: string;
  iconClassName: string;
  valueClassName?: string;
}

function CompactStatusItem({
  icon,
  label,
  value,
  iconClassName,
  valueClassName = "text-[#111827] dark:text-white",
}: CompactStatusItemProps) {
  return (
    <div className="fx2-card fx2-outline flex items-center gap-3 px-4 py-3">
      <span className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${iconClassName}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className={`text-2xl font-bold leading-none ${valueClassName}`}>{value}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-[#6B7280] dark:text-slate-400">{label}</p>
      </div>
    </div>
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
    startSession,
    stopSession,
    disconnectHardware,
    pushManualUpdate,
    applyPreset,
  } = useFx2RealtimeSession();
  const { chartTheme, toggleDarkMode } = useFx2Theme();

  const [panelOpen, setPanelOpen] = useState(false);
  const [windowSeconds, setWindowSeconds] = useState<ExtWindowSeconds>(30);
  const [paused, setPaused] = useState(false);
  const [ch1Visible, setCh1Visible] = useState(true);
  const [ch2Visible, setCh2Visible] = useState(true);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [eventLogExpanded, setEventLogExpanded] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 640 : true
  );

  const logContainerRef = useRef<HTMLUListElement | null>(null);
  const logPinnedRef = useRef(true);
  const prevPhaseRef = useRef(sessionPhase);
  const sessionStartTsRef = useRef<number | null>(null);

  // EEG session recorder (samples stored outside React state)
  const {
    summary: recSummary,
    startRecording,
    stopRecording,
    clearRecording,
    appendSample,
    exportCsv,
    exportJson,
  } = useEegSessionRecorder();

  // Track session phase transitions → start/stop recording
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = sessionPhase;

    if (prev === sessionPhase) return;

    if (sessionPhase === "running") {
      sessionStartTsRef.current = Date.now();
      startRecording(selectedMode);
    } else if (sessionPhase === "stopped" && prev === "running") {
      stopRecording();
    }
  }, [sessionPhase, selectedMode, startRecording, stopRecording]);

  // Append one sample per state update (each new data point)
  const prevTimestampLengthRef = useRef(state.timestamps.length);
  useEffect(() => {
    if (sessionPhase !== "running") return;
    if (state.timestamps.length === prevTimestampLengthRef.current) return;
    prevTimestampLengthRef.current = state.timestamps.length;

    const lastIdx = state.timestamps.length - 1;
    if (lastIdx < 0) return;

    const ts = state.timestamps[lastIdx];
    const startTs = sessionStartTsRef.current ?? ts;

    appendSample({
      timestamp: new Date(ts).toISOString(),
      elapsedMs: Math.max(0, ts - startTs),
      ch1: state.ch1[lastIdx] ?? 0,
      ch2: state.ch2[lastIdx] ?? 0,
      bpm: state.heartRate,
      wear: state.wearStatus,
      signal: state.signalStatus,
      mode: state.mode,
    });
  }, [state.timestamps.length, state.heartRate, state.wearStatus, state.signalStatus, sessionPhase, appendSample]);

  const visibleLogs = useMemo(
    () => state.logs.slice().reverse().slice(0, 10),
    [state.logs]
  );

  // Display buffer — only recent window points, never full recording
  const chartSeries = useMemo(() => {
    const pointLimit = chartPointLimitMap[windowSeconds];
    const pointCount = Math.min(
      state.ch1.length,
      state.ch2.length,
      state.timestamps.length,
      pointLimit
    );

    return {
      ch1: state.ch1.slice(-pointCount),
      ch2: state.ch2.slice(-pointCount),
      timestamps: state.timestamps.slice(-pointCount),
    };
  }, [state.ch1, state.ch2, state.timestamps, windowSeconds]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const syncExpanded = (matches: boolean) => {
      if (matches) { setEventLogExpanded(true); return; }
      setEventLogExpanded(false);
    };

    const handleChange = (event: MediaQueryListEvent) => syncExpanded(event.matches);
    syncExpanded(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!autoScrollLogs || !logPinnedRef.current) return;
    logContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [autoScrollLogs, visibleLogs]);

  const handleLogScroll = () => {
    const node = logContainerRef.current;
    if (!node) return;
    logPinnedRef.current = node.scrollTop <= 12;
  };

  const isRunning = sessionPhase === "running";
  const isStopped = sessionPhase === "stopped";
  const canReconnect =
    selectedMode !== "demo" &&
    (hardwareStatus === "idle" || hardwareStatus === "error");

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Status bar */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="grid grid-cols-2 gap-3 2xl:flex 2xl:flex-1 2xl:flex-nowrap">
              <CompactStatusItem
                icon={<HeartIcon />}
                label="심박수"
                value={`${state.heartRate}`}
                iconClassName="bg-red-50 text-[#EF4444] dark:bg-red-500/10 dark:text-red-300"
              />
              <CompactStatusItem
                icon={<WearIcon />}
                label="착용"
                value={wearLabel[state.wearStatus]}
                iconClassName={
                  state.wearStatus === "worn"
                    ? "bg-green-50 text-[#22C55E] dark:bg-green-500/10 dark:text-green-300"
                    : state.wearStatus === "unstable"
                    ? "bg-amber-50 text-[#F59E0B] dark:bg-amber-500/10 dark:text-amber-300"
                    : "bg-red-50 text-[#EF4444] dark:bg-red-500/10 dark:text-red-300"
                }
                valueClassName={
                  state.wearStatus === "worn"
                    ? "text-[#22C55E] dark:text-green-300"
                    : state.wearStatus === "unstable"
                    ? "text-[#F59E0B] dark:text-amber-300"
                    : "text-[#EF4444] dark:text-red-300"
                }
              />
              <CompactStatusItem
                icon={<SignalIcon />}
                label="신호"
                value={`${state.signalQuality}%`}
                iconClassName={
                  state.signalStatus === "good"
                    ? "bg-green-50 text-[#22C55E] dark:bg-green-500/10 dark:text-green-300"
                    : state.signalStatus === "normal"
                    ? "bg-amber-50 text-[#F59E0B] dark:bg-amber-500/10 dark:text-amber-300"
                    : "bg-red-50 text-[#EF4444] dark:bg-red-500/10 dark:text-red-300"
                }
                valueClassName={
                  state.signalStatus === "good"
                    ? "text-[#22C55E] dark:text-green-300"
                    : state.signalStatus === "normal"
                    ? "text-[#F59E0B] dark:text-amber-300"
                    : "text-[#EF4444] dark:text-red-300"
                }
              />
              <CompactStatusItem
                icon={<TimeIcon />}
                label="세션시간"
                value={formatDuration(state.sessionSeconds)}
                iconClassName="bg-blue-50 text-[#2563EB] dark:bg-blue-500/10 dark:text-blue-300"
                valueClassName="text-[#2563EB] dark:text-blue-300"
              />
            </div>

            <div className="flex flex-wrap gap-2 2xl:justify-end">
              {/* REC indicator — visible while running */}
              {isRunning && recSummary.isRecording ? (
                <div className="flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 dark:bg-red-500/10">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  <span className="text-xs font-semibold text-red-600 dark:text-red-300">
                    기록 중
                  </span>
                  <span className="text-xs text-red-500 dark:text-red-400">
                    {formatMs(recSummary.durationMs)}
                  </span>
                  <span className="text-xs text-red-400 dark:text-red-500">
                    {recSummary.sampleCount.toLocaleString()}샘플
                  </span>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setPanelOpen((c) => !c)}
                className="rounded-full bg-[#EAF0F8] px-4 py-2 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#2563EB] hover:text-white dark:bg-slate-800 dark:text-slate-300"
              >
                {panelOpen ? "데모 패널 숨기기" : "데모 패널 열기"}
              </button>
              {selectedMode !== "demo" ? (
                <button
                  type="button"
                  onClick={disconnectHardware}
                  disabled={canReconnect}
                  className="rounded-full bg-[#EAF0F8] px-4 py-2 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  장치 연결 해제
                </button>
              ) : null}
              {canReconnect ? (
                <button
                  type="button"
                  onClick={startSession}
                  className="rounded-full bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white shadow-md transition-opacity duration-200 hover:opacity-90"
                >
                  다시 연결
                </button>
              ) : null}
              <button
                type="button"
                onClick={stopSession}
                className="rounded-full bg-red-50 px-4 py-2 text-xs font-semibold text-[#EF4444] transition-colors duration-200 hover:bg-[#EF4444] hover:text-white dark:bg-red-500/10 dark:text-red-300"
              >
                측정 종료
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280] dark:text-slate-400">
            <span>모드: {selectedMode.toUpperCase()}</span>
            <span>·</span>
            <span>{signalLabel[state.signalStatus]}</span>
            {hardwareDetail ? (
              <>
                <span>·</span>
                <span>{hardwareDetail}</span>
              </>
            ) : null}
          </div>
        </section>

        {/* Export section — shown after session ends if recording exists */}
        {isStopped && recSummary.hasRecording ? (
          <section className="fx2-card fx2-outline">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="fx2-title">데이터 내보내기</h2>
                <p className="mt-1 text-xs text-[#6B7280] dark:text-slate-400">
                  기록 시간 {formatMs(recSummary.durationMs)} · {recSummary.sampleCount.toLocaleString()}샘플
                  {recSummary.startedAt
                    ? ` · ${new Date(recSummary.startedAt).toLocaleTimeString("ko-KR")} 시작`
                    : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  className="rounded-full bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 transition-colors duration-200 hover:bg-green-600 hover:text-white dark:bg-green-500/10 dark:text-green-300 dark:hover:bg-green-600 dark:hover:text-white"
                >
                  CSV 내보내기
                </button>
                <button
                  type="button"
                  onClick={exportJson}
                  className="rounded-full bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 transition-colors duration-200 hover:bg-[#2563EB] hover:text-white dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-[#2563EB] dark:hover:text-white"
                >
                  JSON 내보내기
                </button>
                <button
                  type="button"
                  onClick={clearRecording}
                  className="rounded-full bg-[#EAF0F8] px-4 py-2 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  기록 초기화
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {/* EEG chart */}
        <div className="w-full">
          <EEGChartV2
            ch1={chartSeries.ch1}
            ch2={chartSeries.ch2}
            timestamps={chartSeries.timestamps}
            mode={selectedMode}
            windowSeconds={windowSeconds}
            paused={paused}
            ch1Visible={ch1Visible}
            ch2Visible={ch2Visible}
            theme={chartTheme}
            onPauseToggle={() => setPaused((c) => !c)}
            onWindowChange={setWindowSeconds}
            onCh1Toggle={() => setCh1Visible((c) => !c)}
            onCh2Toggle={() => setCh2Visible((c) => !c)}
            onThemeToggle={toggleDarkMode}
          />
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <section className="fx2-card fx2-outline">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="fx2-title">이벤트 로그</h2>
                <p className="mt-1 text-xs text-[#6B7280] dark:text-slate-400">
                  최신 기록이 위에 오며, 최대 10개까지 표시됩니다.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAutoScrollLogs((c) => !c)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                    autoScrollLogs
                      ? "bg-[#2563EB] text-white"
                      : "bg-[#EAF0F8] text-[#6B7280] hover:bg-[#2563EB] hover:text-white dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  자동 스크롤
                </button>
                <button
                  type="button"
                  onClick={() => setEventLogExpanded((c) => !c)}
                  className="rounded-full bg-[#EAF0F8] px-3 py-1.5 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:hidden"
                >
                  {eventLogExpanded ? "접기" : "펼치기"}
                </button>
              </div>
            </div>

            {eventLogExpanded ? (
              <ul
                ref={logContainerRef}
                onScroll={handleLogScroll}
                className="max-h-[240px] space-y-2 overflow-y-auto pr-1"
              >
                {visibleLogs.length > 0 ? (
                  visibleLogs.map((log, index) => (
                    <li
                      key={`${log}-${index}`}
                      className="fx2-surface rounded-2xl px-3 py-2 text-xs leading-5 text-[#6B7280] dark:text-slate-300"
                    >
                      {log}
                    </li>
                  ))
                ) : (
                  <li className="fx2-surface rounded-2xl px-3 py-4 text-xs text-[#6B7280] dark:text-slate-400">
                    아직 기록된 이벤트가 없습니다.
                  </li>
                )}
              </ul>
            ) : (
              <button
                type="button"
                onClick={() => setEventLogExpanded(true)}
                className="fx2-surface w-full rounded-2xl px-4 py-4 text-left text-sm font-medium text-[#111827] transition-colors duration-200 dark:text-white"
              >
                이벤트 로그 열기
                <p className="mt-1 text-xs font-normal text-[#6B7280] dark:text-slate-400">
                  최근 {visibleLogs.length}개의 로그가 준비되어 있습니다.
                </p>
              </button>
            )}
          </section>

          <LineChartCard
            title="심박 추이"
            subtitle={`평균 ${summary.averageHeartRate || state.heartRate} bpm · 안정도 ${summary.stabilityScore}%`}
            values={state.heartRateHistory}
            color="#2563EB"
          />
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
