import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import EEGChartV2 from "../components/EEGChartV2";
import LineChartCard from "../components/LineChartCard";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";
import { useFx2Theme } from "../context/ThemeContext";
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

const formatFileSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.ceil(bytes / 1024)}KB`;
};

const getBpmValueClassName = (bpm: number): string => {
  if (bpm < 50 || bpm > 130) return "text-[#EF4444] dark:text-red-400";
  if (bpm < 60 || bpm > 100) return "text-[#F59E0B] dark:text-amber-400";
  return "text-[#111827] dark:text-white";
};

const getSignalBarClassName = (quality: number): string => {
  if (quality >= 90) return "bg-[#22C55E]";
  if (quality >= 60) return "bg-[#F59E0B]";
  return "bg-[#EF4444]";
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

const ELECTRODE_INDICATORS = [
  { label: "REF", bit: 0x08 },
  { label: "EEG1", bit: 0x20 },
  { label: "EEG2", bit: 0x10 },
] as const;

function ElectrodeDots({ electrodeStatus }: { electrodeStatus: number | null }) {
  return (
    <span className="inline-flex items-center gap-2">
      {ELECTRODE_INDICATORS.map(({ label, bit }) => {
        const isKnown = electrodeStatus !== null;
        const statusBits = electrodeStatus ?? 0;
        const isOn = isKnown && (statusBits & bit) !== 0;
        const dotClass = !isKnown
          ? "bg-slate-300 dark:bg-slate-600"
          : isOn
          ? "bg-green-500"
          : "bg-red-400";

        return (
          <span key={label} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass}`} />
            <span>{label}</span>
          </span>
        );
      })}
    </span>
  );
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const n = Math.min(values.length, 30);
  const recent = values.slice(-n);
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const range = max - min || 1;
  const W = 56;
  const H = 16;
  const points = recent
    .map((v, i) => `${(i / (n - 1)) * W},${H - ((v - min) / range) * H}`)
    .join(" ");
  return (
    <svg width={W} height={H} className="mt-1.5 overflow-visible opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  children?: ReactNode;
}

function CompactStatusItem({ icon, label, value, iconClassName, valueClassName = "text-[#111827] dark:text-white", children }: CompactStatusItemProps) {
  return (
    <div className="fx2-card fx2-outline flex items-center gap-3 px-4 py-3">
      <span className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${iconClassName}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-2xl font-bold leading-none ${valueClassName}`}>{value}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-[#6B7280] dark:text-slate-400">{label}</p>
        {children}
      </div>
    </div>
  );
}

export default function LivePage() {
  const {
    state,
    sessionPhase,
    hardwareStatus,
    recorderSummary,
    connectDevice,
    disconnectDevice,
    startSession,
    stopSession,
    appendSample,
    exportCsv,
    exportJson,
    clearRecording,
  } = useFx2RealtimeSession();
  const { chartTheme } = useFx2Theme();

  const [windowSeconds, setWindowSeconds] = useState<ExtWindowSeconds>(30);
  const [paused, setPaused] = useState(false);
  const [ch1Visible, setCh1Visible] = useState(true);
  const [ch2Visible, setCh2Visible] = useState(true);
  const [showCharts, setShowCharts] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const logContainerRef = useRef<HTMLUListElement | null>(null);
  const logPinnedRef = useRef(true);
  const prevPhaseRef = useRef(sessionPhase);
  const sessionStartTsRef = useRef<number | null>(null);
  const prevTimestampLengthRef = useRef(state.timestamps.length);

  // Throttle secondary chart data to ~4Hz
  const secondaryRef = useRef(state);
  secondaryRef.current = state;
  const [secondary, setSecondary] = useState(state);
  useEffect(() => {
    const id = window.setInterval(() => { setSecondary(secondaryRef.current); }, 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = sessionPhase;
    if (prev === sessionPhase) return;
    if (sessionPhase === "running") {
      sessionStartTsRef.current = Date.now();
      prevTimestampLengthRef.current = 0;
    }
  }, [sessionPhase]);

  useEffect(() => {
    if (sessionPhase !== "running") return;
    const previousLength = prevTimestampLengthRef.current;
    if (state.timestamps.length === previousLength) return;
    prevTimestampLengthRef.current = state.timestamps.length;

    for (let index = previousLength; index < state.timestamps.length; index++) {
      const ts = state.timestamps[index];
      const startTs = sessionStartTsRef.current ?? ts;
      appendSample({
        timestamp: new Date(ts).toISOString(),
        elapsedMs: Math.max(0, ts - startTs),
        pc: state.pc[index] ?? 0,
        ch1: state.ch1[index] ?? 0,
        ch2: state.ch2[index] ?? 0,
        bpm: state.heartRate,
        ppg: state.ppg[index] ?? 0,
        sdppg: state.sdppg[index] ?? 0,
        rrInterval: state.rrInterval[index] ?? 0,
        powerSpectrum: state.powerSpectrum[index] ?? 0,
        wear: state.wearStatus,
        signal: state.signalStatus,
        mode: state.mode,
      });
    }
  }, [state.timestamps.length, state.pc, state.ch1, state.ch2, state.ppg, state.sdppg, state.rrInterval, state.powerSpectrum, state.heartRate, state.wearStatus, state.signalStatus, sessionPhase, appendSample]);

  const visibleLogs = useMemo(() => state.logs.slice().reverse().slice(0, 10), [state.logs]);

  const chartSeries = useMemo(() => {
    const n = Math.min(state.ch1.length, state.ch2.length, state.timestamps.length);
    if (n === state.ch1.length && n === state.ch2.length && n === state.timestamps.length) {
      return { ch1: state.ch1, ch2: state.ch2, timestamps: state.timestamps };
    }
    return { ch1: state.ch1.slice(-n), ch2: state.ch2.slice(-n), timestamps: state.timestamps.slice(-n) };
  }, [state.ch1, state.ch2, state.timestamps]);

  useEffect(() => {
    if (!logPinnedRef.current) return;
    logContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [visibleLogs]);

  const handleLogScroll = () => {
    const node = logContainerRef.current;
    if (!node) return;
    logPinnedRef.current = node.scrollTop <= 12;
  };

  const isRunning = sessionPhase === "running";
  const isStopped = sessionPhase === "stopped";
  const isConnected = hardwareStatus === "connected";
  const isConnecting = hardwareStatus === "requesting" || hardwareStatus === "connecting";
  const canConnect = hardwareStatus === "idle" || hardwareStatus === "error" || hardwareStatus === "unsupported";

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Status cards */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="grid grid-cols-2 gap-3 2xl:flex 2xl:flex-1 2xl:flex-nowrap">
              <CompactStatusItem
                icon={<HeartIcon />}
                label="심박수"
                value={`${state.heartRate}`}
                iconClassName="bg-red-50 text-[#EF4444] dark:bg-red-500/10 dark:text-red-300"
                valueClassName={getBpmValueClassName(state.heartRate)}
              >
                <MiniSparkline values={state.heartRateHistory} color="#EF4444" />
              </CompactStatusItem>
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
              >
                <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${getSignalBarClassName(state.signalQuality)}`}
                    style={{ width: `${Math.min(100, Math.max(0, state.signalQuality))}%` }}
                  />
                </div>
                <MiniSparkline values={state.signalQualityHistory} color="#22C55E" />
              </CompactStatusItem>
              <CompactStatusItem
                icon={<TimeIcon />}
                label="세션시간"
                value={formatDuration(state.sessionSeconds)}
                iconClassName="bg-blue-50 text-[#2563EB] dark:bg-blue-500/10 dark:text-blue-300"
                valueClassName="text-[#2563EB] dark:text-blue-300"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 2xl:justify-end">
              {/* Session phase badge */}
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                isRunning
                  ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300"
                  : isStopped
                  ? "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
                  : isConnected
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                  : "bg-[#EAF0F8] text-[#6B7280] dark:bg-slate-800 dark:text-slate-400"
              }`}>
                <span className={`inline-block h-2 w-2 rounded-full ${
                  isRunning ? "animate-pulse bg-green-500"
                  : isConnected ? "bg-blue-500"
                  : isStopped ? "bg-slate-400"
                  : "bg-gray-300"
                }`} />
                {isRunning ? "측정 중" : isStopped ? "중지됨" : isConnected ? "연결됨" : "대기"}
              </span>

              {/* Action buttons */}
              {isConnecting ? (
                <button type="button" disabled
                  className="cursor-wait rounded-full bg-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 dark:bg-slate-700 dark:text-slate-400">
                  연결 중...
                </button>
              ) : canConnect ? (
                <button
                  type="button"
                  onClick={() => void connectDevice()}
                  className="rounded-full bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:opacity-90"
                >
                  장치 연결
                </button>
              ) : isConnected && !isRunning ? (
                <>
                  <button
                    type="button"
                    onClick={startSession}
                    className="rounded-full bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:opacity-90"
                  >
                    측정 시작
                  </button>
                  <button
                    type="button"
                    onClick={disconnectDevice}
                    className="rounded-full bg-[#EAF0F8] px-4 py-2 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    연결 해제
                  </button>
                </>
              ) : isRunning ? (
                <button
                  type="button"
                  disabled={isStopping}
                  onClick={() => { setIsStopping(true); stopSession(); setTimeout(() => setIsStopping(false), 600); }}
                  className="rounded-full bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition-colors duration-200 hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-600 dark:hover:text-white"
                >
                  {isStopping ? "종료 중…" : "측정 종료"}
                </button>
              ) : null}

            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280] dark:text-slate-400">
            <span>Web Serial</span>
            <span>·</span>
            <span>{signalLabel[state.signalStatus]}</span>
            <span>|</span>
            <ElectrodeDots electrodeStatus={state.electrodeStatus} />
          </div>
        </section>

        {/* Export section */}
        {isStopped && recorderSummary.hasRecording ? (
          <div className="flex justify-end">
            <Link
              to="/summary"
              className="inline-flex items-center gap-1 text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8] dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              세션 요약 보기 →
            </Link>
          </div>
        ) : null}
        {isStopped && recorderSummary.hasRecording ? (
          <section className="fx2-card fx2-outline border-l-4 border-l-green-400">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="fx2-title">데이터 저장</h2>
                <p className="mt-1 text-xs text-[#6B7280] dark:text-slate-400">
                  기록 시간 {formatMs(recorderSummary.durationMs)} · {recorderSummary.sampleCount.toLocaleString()}샘플
                  {recorderSummary.startedAt ? ` · ${new Date(recorderSummary.startedAt).toLocaleTimeString("ko-KR")} 시작` : null}
                  {" "}· CSV≈{formatFileSize(recorderSummary.sampleCount * 100 + 600)} / JSON≈{formatFileSize(recorderSummary.sampleCount * 160 + 200)}
                </p>
                <p className="mt-0.5 text-xs text-green-600 dark:text-green-400">
                  차트에서 사라진 데이터도 CSV에 모두 포함됩니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={exportCsv} disabled={recorderSummary.isRecording} className="rounded-full bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 transition-colors duration-200 hover:bg-green-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-green-500/10 dark:text-green-300 dark:hover:bg-green-600 dark:hover:text-white">CSV 저장</button>
                <button type="button" onClick={exportJson} disabled={recorderSummary.isRecording} className="rounded-full bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 transition-colors duration-200 hover:bg-[#2563EB] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-[#2563EB] dark:hover:text-white">JSON 저장</button>
                <button type="button" onClick={clearRecording} disabled={recorderSummary.isRecording} className="rounded-full bg-[#EAF0F8] px-4 py-2 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">기록 초기화</button>
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
            windowSeconds={windowSeconds}
            paused={paused}
            ch1Visible={ch1Visible}
            ch2Visible={ch2Visible}
            theme={chartTheme}
            onPauseToggle={() => setPaused((c) => !c)}
            onWindowChange={setWindowSeconds}
            onCh1Toggle={() => setCh1Visible((c) => !c)}
            onCh2Toggle={() => setCh2Visible((c) => !c)}
          />
          <p className="mt-1 text-center text-[10px] text-[#6B7280] dark:text-slate-500">
            <span className="sm:hidden"><strong>두 손가락 핀치로 줌</strong> · 드래그로 이동 · 시간창 버튼으로 범위 선택</span>
            <span className="hidden sm:inline">
              <strong>마우스 휠로 줌</strong> · 드래그로 이동 · 시간창 버튼으로 범위 선택 ·{" "}
              <kbd className="rounded bg-slate-200 px-1 text-[9px] dark:bg-slate-700">Space</kbd> 일시정지 ·{" "}
              <kbd className="rounded bg-slate-200 px-1 text-[9px] dark:bg-slate-700">L</kbd> 라이브
            </span>
          </p>
        </div>

        {/* Secondary charts */}
        <div>
          <button
            type="button"
            onClick={() => setShowCharts((v) => !v)}
            className="mb-3 rounded-full bg-[#EAF0F8] px-4 py-2 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
          >
            {showCharts ? "보조 차트 숨기기 ▲" : "보조 차트 보기 ▼"}
          </button>

          {showCharts ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <LineChartCard values={secondary.heartRateHistory} color="#EF4444" label="심박 추이 (BPM)" />
              <LineChartCard values={secondary.ppg} timestamps={secondary.timestamps} color="#10B981" label="PPG" />
              <LineChartCard values={secondary.sdppg} timestamps={secondary.timestamps} color="#F59E0B" label="sdPPG" />
              <LineChartCard values={secondary.pc} timestamps={secondary.timestamps} color="#0EA5E9" label="PC counter" />
              <LineChartCard values={secondary.rrInterval} color="#8B5CF6" label="RR 간격 (ms)" />
              <LineChartCard values={secondary.powerSpectrum} color="#EC4899" label="파워 스펙트럼" />
              <section className="fx2-card fx2-outline">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400">이벤트 로그</h2>
                <ul
                  ref={logContainerRef}
                  onScroll={handleLogScroll}
                  className="max-h-[120px] space-y-1.5 overflow-y-auto pr-1"
                >
                  {visibleLogs.length > 0 ? (
                    visibleLogs.map((log, index) => (
                      <li key={`${log}-${index}`} className="fx2-surface rounded-xl px-3 py-1.5 text-xs leading-5 text-[#6B7280] dark:text-slate-300">{log}</li>
                    ))
                  ) : (
                    <li className="fx2-surface rounded-xl px-3 py-2 text-xs text-[#6B7280] dark:text-slate-400">아직 기록된 이벤트가 없습니다.</li>
                  )}
                </ul>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
