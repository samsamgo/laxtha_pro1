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

function FeatureChip({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-[#374151] ring-1 ring-[#E5EBF4] backdrop-blur dark:bg-slate-800/70 dark:text-slate-200 dark:ring-slate-700">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2563EB]" aria-hidden="true" />
      {children}
    </li>
  );
}

export default function LivePage() {
  const {
    state,
    sessionPhase,
    hardwareStatus,
    recorderSummary,
    needsReload,
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
  const [showDiagnostics, setShowDiagnostics] = useState(false);
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
      appendSample({
        timestamp: new Date(ts).toISOString(),
        elapsedMs: Math.max(0, ts - startTs),
        pc: state.pc[index] ?? 0,
        ch1: state.ch1[index] ?? 0,
        ch2: state.ch2[index] ?? 0,
        bpm: state.bpmSamples[index] ?? state.heartRate,
        ppg: state.ppg[index] ?? 0,
        sdppg: state.sdppg[index] ?? 0,
        rrInterval: state.rrInterval[index] ?? 0,
        powerSpectrum: state.powerSpectrum[index] ?? 0,
        wear: state.wearSamples[index] ?? state.wearStatus,
        signal: state.signalSamples[index] ?? state.signalStatus,
        mode: state.mode,
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
    state.bpmSamples,
    state.wearSamples,
    state.signalSamples,
    state.heartRate,
    state.wearStatus,
    state.signalStatus,
    sessionPhase,
    appendSample,
  ]);

  const visibleLogs = useMemo(
    () => state.logs.slice().reverse().slice(0, 10),
    [state.logs]
  );

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
  const isConnecting =
    hardwareStatus === "requesting" || hardwareStatus === "connecting";
  const isUnsupported = hardwareStatus === "unsupported";
  const hasError = hardwareStatus === "error";
  const canConnect =
    hardwareStatus === "idle" || hasError || isUnsupported;

  const hasLiveData = state.stats.sampleCount > 0;
  const showOnboarding = !isRunning && !hasLiveData && !isStopped;

  const handleReload = () => window.location.reload();

  return (
    <div className="flex flex-col gap-5">
      {showOnboarding ? (
        <section
          aria-labelledby="onboarding-title"
          className="fx2-card fx2-outline relative overflow-hidden border-l-4 border-l-[#2563EB] !p-6 sm:!p-8"
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gradient-to-br from-[#2563EB]/15 to-[#06B6D4]/10 blur-2xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#2563EB]">
                LAXTHA FX2 EEG
              </p>
              <h2
                id="onboarding-title"
                className="mt-2 text-2xl font-bold leading-tight tracking-tight text-[#111827] dark:text-white sm:text-3xl"
              >
                서버 없이, Chrome에서 바로 시작하는 실시간 뇌파 측정
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#6B7280] dark:text-slate-400">
                OMC-M10 장치를 Bluetooth SPP 또는 USB로 연결하면 60Hz 라이브 차트, 심박·신호 품질·전극 상태가 즉시 표시됩니다. 측정 종료 후 CSV / JSON으로 내보낼 수 있습니다.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                <FeatureChip>Web Serial · 서버 불필요</FeatureChip>
                <FeatureChip>60Hz 실시간 차트</FeatureChip>
                <FeatureChip>CSV / JSON 내보내기</FeatureChip>
                <FeatureChip>다크 모드</FeatureChip>
              </ul>
            </div>

            <div className="flex flex-col gap-2 lg:items-end">
              {isUnsupported ? (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  이 브라우저는 Web Serial을 지원하지 않습니다.
                  <br />
                  <span className="font-semibold">Chrome 또는 Edge</span>에서 다시 열어 주세요.
                </div>
              ) : needsReload ? (
                <button
                  type="button"
                  onClick={handleReload}
                  className="fx2-btn-primary !px-5 !py-2.5 !text-sm"
                  aria-describedby="onboarding-help"
                >
                  🔄 페이지 새로고침
                </button>
              ) : isConnecting ? (
                <button type="button" disabled className="fx2-btn-primary cursor-wait">
                  <span className="h-2 w-2 animate-ping rounded-full bg-white/80" />
                  연결 중…
                </button>
              ) : canConnect ? (
                <button
                  type="button"
                  onClick={() => void connectDevice()}
                  className="fx2-btn-primary !px-5 !py-2.5 !text-sm"
                  aria-describedby="onboarding-help"
                >
                  장치 연결하기
                </button>
              ) : isConnected ? (
                <button
                  type="button"
                  onClick={startSession}
                  className="fx2-btn-primary !px-5 !py-2.5 !text-sm"
                >
                  ▶ 측정 시작
                </button>
              ) : null}

              <p
                id="onboarding-help"
                className="max-w-xs text-right text-[11px] leading-5 text-[#6B7280] dark:text-slate-500"
              >
                {needsReload
                  ? "장치 연결이 한 번 해제되어 안정적인 재연결을 위해 페이지 새로고침이 필요합니다."
                  : "Bluetooth SPP COM 포트 또는 USB 시리얼을 선택해 주세요. HTTPS·Chrome 환경에서만 작동합니다."}
              </p>
              {hasError && !needsReload ? (
                <p className="text-right text-[11px] text-red-600 dark:text-red-400">
                  마지막 연결 실패: 다시 시도해 주세요.
                </p>
              ) : null}
            </div>
          </div>
        </section>
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
              valueClassName={hasLiveData ? getBpmValueClassName(state.heartRate) : "text-[#9CA3AF] dark:text-slate-600"}
            >
              {hasLiveData ? <MiniSparkline values={state.heartRateHistory} color="#EF4444" /> : null}
            </CompactStatusItem>

            <CompactStatusItem
              icon={<WearIcon />}
              label="착용"
              value={hasLiveData ? wearLabel[state.wearStatus] : "—"}
              iconClassName={
                !hasLiveData
                  ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                  : state.wearStatus === "worn"
                  ? "bg-green-50 text-[#22C55E] dark:bg-green-500/10 dark:text-green-300"
                  : state.wearStatus === "unstable"
                  ? "bg-amber-50 text-[#F59E0B] dark:bg-amber-500/10 dark:text-amber-300"
                  : "bg-red-50 text-[#EF4444] dark:bg-red-500/10 dark:text-red-300"
              }
              valueClassName={
                !hasLiveData
                  ? "text-[#9CA3AF] dark:text-slate-600"
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
                  ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                  : state.signalStatus === "good"
                  ? "bg-green-50 text-[#22C55E] dark:bg-green-500/10 dark:text-green-300"
                  : state.signalStatus === "normal"
                  ? "bg-amber-50 text-[#F59E0B] dark:bg-amber-500/10 dark:text-amber-300"
                  : "bg-red-50 text-[#EF4444] dark:bg-red-500/10 dark:text-red-300"
              }
              valueClassName={
                !hasLiveData
                  ? "text-[#9CA3AF] dark:text-slate-600"
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
                  : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
              }
              valueClassName={hasLiveData ? "text-[#2563EB] dark:text-blue-300" : "text-[#9CA3AF] dark:text-slate-600"}
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
                  ? "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
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

            {/* During onboarding the hero owns the primary CTA — avoid duplicating it here */}
            {showOnboarding ? null : isConnecting ? (
              <button type="button" disabled className="fx2-btn-secondary cursor-wait">
                연결 중…
              </button>
            ) : needsReload ? (
              <button
                type="button"
                onClick={handleReload}
                className="fx2-btn-primary"
                title="안정적인 재연결을 위해 페이지를 새로고침합니다"
              >
                🔄 페이지 새로고침
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
                  onClick={disconnectDevice}
                  className="fx2-btn-secondary"
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
                  onClick={clearRecording}
                  disabled={recorderSummary.isRecording}
                  className="fx2-btn-secondary disabled:opacity-40"
                >
                  기록 초기화
                </button>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="gpt-title"
            className="fx2-card fx2-outline relative overflow-hidden border-l-4 border-l-violet-500"
          >
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-violet-400/15 to-fuchsia-400/10 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-600 dark:text-violet-300">
                  AI 분석 · ChatGPT
                </p>
                <h2 id="gpt-title" className="fx2-title mt-1">
                  🤖 LAXTHA 뇌파 브리핑으로 분석하기
                </h2>
                <p className="mt-1.5 text-xs leading-5 text-[#6B7280] dark:text-slate-400">
                  버튼을 누르면 JSON이 다운로드되고 GPT가 새 탭으로 열립니다.
                  다운로드된 파일을 GPT 대화창에 끌어놓으면 측정 결과를 친근하게 풀어 설명해 드려요.
                </p>
                <p className="mt-1 text-[11px] text-[#9CA3AF] dark:text-slate-500">
                  ※ 건강 정보 참고용이며, 의료 진단을 대체하지 않습니다.
                </p>
              </div>
              <div className="flex flex-shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openLaxthaGpt();
                    exportJson();
                  }}
                  disabled={recorderSummary.isRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-violet-700 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="JSON 다운로드 후 LAXTHA 뇌파 브리핑 GPT를 새 탭에서 엽니다"
                >
                  🤖 GPT로 분석
                </button>
                <button
                  type="button"
                  onClick={openLaxthaGpt}
                  className="fx2-btn-secondary"
                  aria-label="LAXTHA 뇌파 브리핑 GPT만 새 탭에서 열기"
                  title="이미 JSON 파일이 있다면 GPT만 열기"
                >
                  GPT만 열기
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
        <p className="mt-1 text-center text-[10px] text-[#6B7280] dark:text-slate-500">
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

      {/* Secondary charts + diagnostics toggle */}
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
            onClick={() => setShowDiagnostics((v) => !v)}
            aria-expanded={showDiagnostics}
            aria-controls="diagnostics-panel"
            className="fx2-btn-secondary"
            title="신호 품질 점검용 진단 데이터"
          >
            {showDiagnostics ? "진단 데이터 숨기기 ▲" : "진단 데이터 보기 ▼"}
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
              label="혈류 신호 (PPG)"
              description="심장 박동에 따라 변하는 빛 흡수량. 맥파 모양을 보여줍니다."
            />
            <LineChartCard
              values={secondary.sdppg}
              timestamps={secondary.timestamps}
              color="#F59E0B"
              label="혈류 미분 (sdPPG)"
              description="PPG의 변화율. 혈관 탄성·수축 강도 추정에 사용됩니다."
            />
            <LineChartCard
              values={secondary.rrInterval}
              color="#8B5CF6"
              label="심박 간격 (RR, ms)"
              description="심박 간 시간 간격. HRV(자율신경) 계산의 기본 입력값입니다."
            />
            <LineChartCard
              values={secondary.powerSpectrum}
              color="#EC4899"
              label="EEG 파워"
              description="뇌파 전체 에너지(파워 스펙트럼). 약 2초마다 갱신됩니다."
            />
          </div>
        ) : null}

        {showDiagnostics ? (
          <div
            id="diagnostics-panel"
            className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${showCharts ? "mt-3" : ""}`}
          >
            <LineChartCard
              values={secondary.pc}
              timestamps={secondary.timestamps}
              color="#0EA5E9"
              label="PC 프레임 카운터"
              description="0–31 순환. 통신 손실 시 건너뜀이 발생합니다. (진단용)"
            />
            <LineChartCard
              values={secondary.pcStep}
              timestamps={secondary.timestamps}
              color="#F97316"
              label="PC 프레임 간격"
              description="연속 프레임 간 step 값. 1이 정상, 2 이상이면 드롭 발생. (진단용)"
            />
            <section className="fx2-card fx2-outline">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400">
                  이벤트 로그
                </h2>
                <p className="mt-0.5 text-[10px] leading-4 text-[#9CA3AF] dark:text-slate-500">
                  착용·신호 상태가 바뀐 시점이 기록됩니다.
                </p>
              </div>
              <ul
                ref={logContainerRef}
                onScroll={handleLogScroll}
                aria-label="이벤트 로그"
                className="mt-2 max-h-[120px] space-y-1.5 overflow-y-auto pr-1"
              >
                {visibleLogs.length > 0 ? (
                  visibleLogs.map((log, index) => (
                    <li
                      key={`${log}-${index}`}
                      className="fx2-surface rounded-xl px-3 py-1.5 text-xs leading-5 text-[#6B7280] dark:text-slate-300"
                    >
                      {log}
                    </li>
                  ))
                ) : (
                  <li className="fx2-surface rounded-xl px-3 py-2 text-xs text-[#6B7280] dark:text-slate-400">
                    아직 기록된 이벤트가 없습니다.
                  </li>
                )}
              </ul>
            </section>
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
                  <span className="ml-2 text-[11px] text-[#6B7280] dark:text-slate-500">/</span>
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
