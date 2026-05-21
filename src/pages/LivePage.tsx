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
import { openLaxthaGpt } from "../lib/external";
import { toKstIso } from "../lib/timeFormat";
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
    <span className="inline-flex items-center gap-2" aria-label="전극 연결 상태">
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
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass}`} aria-hidden="true" />
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
    <svg
      width={W}
      height={H}
      className="mt-1.5 overflow-visible opacity-60"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
      <path d="M10 17.1 8.6 15.8C4.1 11.7 1 8.9 1 5.5 1 3 3 1 5.5 1c1.4 0 2.7.6 3.5 1.7C9.8 1.6 11.1 1 12.5 1 15 1 17 3 17 5.5c0 3.4-3.1 6.2-7.6 10.3L10 17.1Z" />
    </svg>
  );
}

function WearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-5 w-5">
      <path d="M4 11c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M6 11v3a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3" />
      <path d="M8 8h4" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-5 w-5">
      <path d="M3 14h2l2-4 3 6 2-4h5" />
      <path d="M3 6h14" opacity="0.25" />
    </svg>
  );
}

function TimeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-5 w-5">
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

function CompactStatusItem({
  icon,
  label,
  value,
  iconClassName,
  valueClassName = "text-[#111827] dark:text-white",
  children,
}: CompactStatusItemProps) {
  return (
    <div className="fx2-card fx2-outline flex items-center gap-3 px-4 py-3">
      <span
        className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${iconClassName}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-2xl font-bold leading-none ${valueClassName}`}>{value}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-[#6B7280] dark:text-slate-400">
          {label}
        </p>
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
  const [showHelp, setShowHelp] = useState(false);

  const requestStopSession = () => {
    const confirmed = window.confirm(
      "측정을 종료하시겠습니까?\n\n현재까지 기록된 데이터는 종료 후 CSV/JSON으로 내보낼 수 있습니다."
    );
    if (!confirmed) return;
    setIsStopping(true);
    stopSession();
    setTimeout(() => setIsStopping(false), 600);
  };

  // Disconnect + reload in one step.
  // Web Serial can't reliably reopen Bluetooth SPP COM ports without a page reset,
  // so disconnect always triggers a reload after the user confirms.
  const requestDisconnect = () => {
    const confirmed = window.confirm(
      "장치 연결을 해제하고 페이지를 새로고침합니다.\n\n" +
      "• 화면에 표시 중인 측정 데이터는 사라집니다.\n" +
      "• 저장하지 않은 CSV / JSON이 있다면 먼저 내보내 주세요.\n\n" +
      "계속하시겠습니까?"
    );
    if (!confirmed) return;
    disconnectDevice();
    window.location.reload();
  };

  // Open help modal on '?' key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowHelp((v) => !v);
      } else if (e.key === "Escape" && showHelp) {
        setShowHelp(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showHelp]);

  // Lock body scroll while help modal is open
  useEffect(() => {
    if (!showHelp) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [showHelp]);

  const prevPhaseRef = useRef(sessionPhase);
  const sessionStartTsRef = useRef<number | null>(null);
  const prevTimestampLengthRef = useRef(state.timestamps.length);

  // Throttle secondary chart data to ~4Hz
  const secondaryRef = useRef(state);
  secondaryRef.current = state;
  const [secondary, setSecondary] = useState(state);
  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondary(secondaryRef.current);
    }, 250);
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
      const rrInterval = state.rrInterval[index];
      appendSample({
        timestamp: toKstIso(ts),
        elapsedMs: Math.max(0, ts - startTs),
        pc: state.pc[index] ?? 0,
        ch1: state.ch1[index] ?? 0,
        ch2: state.ch2[index] ?? 0,
        bpm: state.bpmSamples[index] ?? state.heartRate,
        ppg: state.ppg[index] ?? 0,
        sdppg: state.sdppg[index] ?? 0,
        rrInterval: Number.isFinite(rrInterval) ? rrInterval : 0,
        powerSpectrum: state.powerSpectrum[index] ?? 0,
        wear: state.wearSamples[index] ?? state.wearStatus,
        signal: state.signalSamples[index] ?? state.signalStatus,
        mode: state.mode,
        heartbeatEvent: state.heartbeatEvents[index] ?? false,
        ch1Saturation: state.ch1SaturationSamples[index] ?? null,
        ch2Saturation: state.ch2SaturationSamples[index] ?? null,
        batteryPercent: state.batteryPercentSamples[index] ?? null,
        eegValid: state.eegValidSamples[index] ?? true,
        ppgValid: state.ppgValidSamples[index] ?? true,
      });
    }
  }, [
    state.timestamps.length,
    state.pc,
    state.ch1,
    state.ch2,
    state.ppg,
    state.sdppg,
    state.rrInterval,
    state.powerSpectrum,
    state.heartbeatEvents,
    state.ch1SaturationSamples,
    state.ch2SaturationSamples,
    state.batteryPercentSamples,
    state.eegValidSamples,
    state.ppgValidSamples,
    state.bpmSamples,
    state.wearSamples,
    state.signalSamples,
    state.heartRate,
    state.wearStatus,
    state.signalStatus,
    sessionPhase,
    appendSample,
  ]);

  const chartSeries = useMemo(() => {
    const n = Math.min(state.ch1.length, state.ch2.length, state.timestamps.length);
    if (
      n === state.ch1.length &&
      n === state.ch2.length &&
      n === state.timestamps.length
    ) {
      return { ch1: state.ch1, ch2: state.ch2, timestamps: state.timestamps };
    }
    return {
      ch1: state.ch1.slice(-n),
      ch2: state.ch2.slice(-n),
      timestamps: state.timestamps.slice(-n),
    };
  }, [state.ch1, state.ch2, state.timestamps]);

  const isRunning = sessionPhase === "running";
  const isStopped = sessionPhase === "stopped";
  const isConnected = hardwareStatus === "connected";
  const isConnecting =
    hardwareStatus === "requesting" || hardwareStatus === "connecting";
  const isUnsupported = hardwareStatus === "unsupported";
  const hasError = hardwareStatus === "error";
  const canConnect =
    hardwareStatus === "idle" || hasError || isUnsupported;

  const hasLiveData = state.stats.sampleCount > 0;

  return (
    <div className="flex flex-col gap-5">
      {isUnsupported ? (
        <div
          role="alert"
          className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300"
        >
          이 브라우저는 Web Serial을 지원하지 않습니다. <span className="font-semibold">Chrome 또는 Edge</span>에서 다시 열어 주세요.
        </div>
      ) : null}

      {/* Status cards */}
      <section aria-label="실시간 측정 상태" className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="grid grid-cols-2 gap-3 2xl:flex 2xl:flex-1 2xl:flex-nowrap">
            <CompactStatusItem
              icon={<HeartIcon />}
              label="심박수"
              value={hasLiveData ? `${state.heartRate}` : "—"}
              iconClassName="bg-red-50 text-[#EF4444] dark:bg-red-500/10 dark:text-red-300"
              valueClassName={hasLiveData ? getBpmValueClassName(state.heartRate) : "text-[#6B7280] dark:text-slate-300"}
            >
              {hasLiveData ? <MiniSparkline values={state.heartRateHistory} color="#EF4444" /> : null}
            </CompactStatusItem>

            <CompactStatusItem
              icon={<WearIcon />}
              label="착용"
              value={hasLiveData ? wearLabel[state.wearStatus] : "—"}
              iconClassName={
                !hasLiveData
                  ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  : state.wearStatus === "worn"
                  ? "bg-green-50 text-[#22C55E] dark:bg-green-500/10 dark:text-green-300"
                  : state.wearStatus === "unstable"
                  ? "bg-amber-50 text-[#F59E0B] dark:bg-amber-500/10 dark:text-amber-300"
                  : "bg-red-50 text-[#EF4444] dark:bg-red-500/10 dark:text-red-300"
              }
              valueClassName={
                !hasLiveData
                  ? "text-[#6B7280] dark:text-slate-300"
                  : state.wearStatus === "worn"
                  ? "text-[#22C55E] dark:text-green-300"
                  : state.wearStatus === "unstable"
                  ? "text-[#F59E0B] dark:text-amber-300"
                  : "text-[#EF4444] dark:text-red-300"
              }
            />

            <CompactStatusItem
              icon={<SignalIcon />}
              label="신호"
              value={hasLiveData ? `${state.signalQuality}%` : "—"}
              iconClassName={
                !hasLiveData
                  ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  : state.signalStatus === "good"
                  ? "bg-green-50 text-[#22C55E] dark:bg-green-500/10 dark:text-green-300"
                  : state.signalStatus === "normal"
                  ? "bg-amber-50 text-[#F59E0B] dark:bg-amber-500/10 dark:text-amber-300"
                  : "bg-red-50 text-[#EF4444] dark:bg-red-500/10 dark:text-red-300"
              }
              valueClassName={
                !hasLiveData
                  ? "text-[#6B7280] dark:text-slate-300"
                  : state.signalStatus === "good"
                  ? "text-[#22C55E] dark:text-green-300"
                  : state.signalStatus === "normal"
                  ? "text-[#F59E0B] dark:text-amber-300"
                  : "text-[#EF4444] dark:text-red-300"
              }
            >
              {hasLiveData ? (
                <>
                  <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${getSignalBarClassName(state.signalQuality)}`}
                      style={{ width: `${Math.min(100, Math.max(0, state.signalQuality))}%` }}
                    />
                  </div>
                  <MiniSparkline values={state.signalQualityHistory} color="#22C55E" />
                </>
              ) : null}
            </CompactStatusItem>

            <CompactStatusItem
              icon={<TimeIcon />}
              label="세션시간"
              value={hasLiveData ? formatDuration(state.sessionSeconds) : "—"}
              iconClassName={
                hasLiveData
                  ? "bg-blue-50 text-[#2563EB] dark:bg-blue-500/10 dark:text-blue-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }
              valueClassName={hasLiveData ? "text-[#2563EB] dark:text-blue-300" : "text-[#6B7280] dark:text-slate-300"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 2xl:justify-end">
            <span
              role="status"
              aria-live="polite"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                isRunning
                  ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300"
                  : isConnecting
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                  : isStopped
                  ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  : isConnected
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                  : "bg-[#EAF0F8] text-[#6B7280] dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-block h-2 w-2 rounded-full ${
                  isRunning
                    ? "animate-pulse bg-green-500"
                    : isConnecting
                    ? "animate-pulse bg-amber-400"
                    : isConnected
                    ? "bg-blue-500"
                    : isStopped
                    ? "bg-slate-400"
                    : "bg-gray-300"
                }`}
              />
              {isRunning
                ? "측정 중"
                : isConnecting
                ? "연결 중…"
                : isStopped
                ? "측정 중지됨"
                : isConnected
                ? "측정 준비됨"
                : "장치 대기"}
            </span>

            {/* Single primary CTA in the status bar */}
            {isConnecting ? (
              <button type="button" disabled className="fx2-btn-secondary cursor-wait">
                연결 중…
              </button>
            ) : canConnect ? (
              <button
                type="button"
                onClick={() => void connectDevice()}
                className="fx2-btn-primary"
              >
                장치 연결
              </button>
            ) : isConnected && !isRunning ? (
              <>
                <button type="button" onClick={startSession} className="fx2-btn-primary">
                  ▶ 측정 시작
                </button>
                <button
                  type="button"
                  onClick={requestDisconnect}
                  className="fx2-btn-secondary"
                  title="연결을 해제하고 페이지를 새로고침합니다"
                >
                  연결 해제
                </button>
              </>
            ) : isRunning ? (
              <button
                type="button"
                disabled={isStopping}
                onClick={requestStopSession}
                className="fx2-btn-danger"
              >
                {isStopping ? "종료 중…" : "■ 측정 종료"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280] dark:text-slate-400">
          <span>Web Serial</span>
          <span aria-hidden="true">·</span>
          <span>{hasLiveData ? signalLabel[state.signalStatus] : "데이터 없음"}</span>
          <span aria-hidden="true">|</span>
          <ElectrodeDots electrodeStatus={state.electrodeStatus} />
        </div>
      </section>

      {/* Export section */}
      {isStopped && recorderSummary.hasRecording ? (
        <>
          <div className="flex justify-end">
            <Link
              to="/summary"
              className="inline-flex items-center gap-1 text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8] dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              세션 요약 보기 →
            </Link>
          </div>
          <section
            aria-labelledby="export-title"
            className="fx2-card fx2-outline border-l-4 border-l-emerald-400"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="export-title" className="fx2-title">데이터 저장</h2>
                <p className="mt-1 text-xs text-[#6B7280] dark:text-slate-400">
                  기록 시간 {formatMs(recorderSummary.durationMs)} · {recorderSummary.sampleCount.toLocaleString()}샘플
                  {recorderSummary.startedAt ? ` · ${new Date(recorderSummary.startedAt).toLocaleTimeString("ko-KR")} 시작` : null}
                  {" "}· CSV≈{formatFileSize(recorderSummary.sampleCount * 100 + 600)} / JSON≈{formatFileSize(recorderSummary.sampleCount * 160 + 200)}
                </p>
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                  차트에서 사라진 데이터도 모두 포함됩니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={recorderSummary.isRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 transition-colors duration-200 hover:bg-emerald-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-600 dark:hover:text-white"
                >
                  CSV 저장
                </button>
                <button
                  type="button"
                  onClick={exportJson}
                  disabled={recorderSummary.isRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 transition-colors duration-200 hover:bg-[#2563EB] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-[#2563EB] dark:hover:text-white"
                >
                  JSON 저장
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openLaxthaGpt();
                    exportJson();
                  }}
                  disabled={recorderSummary.isRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="JSON 다운로드 후 LAXTHA 뇌파 브리핑 GPT를 새 탭에서 엽니다"
                  title="JSON 자동 다운로드 + GPT 새 탭으로 열기"
                >
                  🤖 GPT로 분석
                </button>
                <button
                  type="button"
                  onClick={clearRecording}
                  disabled={recorderSummary.isRecording}
                  className="fx2-btn-secondary disabled:opacity-40"
                >
                  기록 초기화
                </button>
              </div>
            </div>
          </section>
        </>
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
        <p className="mt-1 text-center text-[10px] text-[#6B7280] dark:text-slate-300">
          <span className="sm:hidden">
            <strong>두 손가락 핀치로 줌</strong> · 드래그로 이동 · 시간창 버튼으로 범위 선택
          </span>
          <span className="hidden sm:inline">
            <strong>마우스 휠로 줌</strong> · 드래그로 이동 · 시간창 버튼으로 범위 선택 ·{" "}
            <kbd className="rounded bg-slate-200 px-1 text-[9px] dark:bg-slate-700">Space</kbd> 일시정지 ·{" "}
            <kbd className="rounded bg-slate-200 px-1 text-[9px] dark:bg-slate-700">L</kbd> 라이브
          </span>
        </p>
      </div>

      {/* Secondary charts toggle */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCharts((v) => !v)}
            aria-expanded={showCharts}
            aria-controls="secondary-charts"
            className="fx2-btn-secondary"
          >
            {showCharts ? "보조 차트 숨기기 ▲" : "보조 차트 보기 ▼"}
          </button>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-haspopup="dialog"
            aria-expanded={showHelp}
            title="키보드 단축키 및 도움말"
            aria-label="키보드 단축키 도움말 열기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#EAF0F8] text-sm font-bold text-[#374151] transition-colors duration-200 hover:bg-[#111827] hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            ?
          </button>
        </div>

        {showCharts ? (
          <div id="secondary-charts" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <LineChartCard
              values={secondary.heartRateHistory}
              color="#EF4444"
              label="심박 추이 (BPM)"
              description="1초 단위 심박수 변화. 안정 시 60–100 bpm이 일반적입니다."
            />
            <LineChartCard
              values={secondary.ppg}
              timestamps={secondary.timestamps}
              color="#10B981"
              label="혈류 신호 (PPG, au)"
              description="심장 박동에 따라 변하는 빛 흡수량. 맥파 모양을 보여줍니다."
            />
            <LineChartCard
              values={secondary.sdppg}
              timestamps={secondary.timestamps}
              color="#F59E0B"
              label="혈류 미분 (sdPPG, au)"
              description="PPG의 변화율. 혈관 탄성·수축 강도 추정에 사용됩니다."
            />
          </div>
        ) : null}
      </div>

      {showHelp ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHelp(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#2563EB]">
                  Help
                </p>
                <h2 id="help-title" className="mt-1 text-lg font-bold text-[#111827] dark:text-white">
                  키보드 · 마우스 단축키
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                aria-label="도움말 닫기"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6B7280] transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <dl className="mt-4 divide-y divide-[#E5EBF4] text-sm dark:divide-slate-700">
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-[#374151] dark:text-slate-300">일시정지 / 재개</dt>
                <dd>
                  <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    Space
                  </kbd>
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-[#374151] dark:text-slate-300">라이브 엣지로 이동</dt>
                <dd>
                  <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    L
                  </kbd>
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-[#374151] dark:text-slate-300">이 도움말</dt>
                <dd>
                  <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    ?
                  </kbd>
                  <span className="ml-2 text-[11px] text-[#6B7280] dark:text-slate-300">/</span>
                  <kbd className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    Esc
                  </kbd>
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-[#374151] dark:text-slate-300">차트 줌</dt>
                <dd className="text-[11px] text-[#6B7280] dark:text-slate-400">마우스 휠 · 핀치</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-[#374151] dark:text-slate-300">차트 이동</dt>
                <dd className="text-[11px] text-[#6B7280] dark:text-slate-400">드래그</dd>
              </div>
            </dl>

            <div className="mt-5 rounded-xl bg-[#EAF0F8] p-3 text-[11px] leading-5 text-[#6B7280] dark:bg-slate-800 dark:text-slate-400">
              <p className="font-semibold text-[#374151] dark:text-slate-200">측정 데이터 안전</p>
              <p className="mt-1">
                모든 측정값은 브라우저 메모리에만 저장되며 외부로 전송되지 않습니다.
                내보낸 CSV/JSON 파일은 사용자의 다운로드 폴더에만 저장됩니다.
              </p>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="fx2-btn-primary"
                autoFocus
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
