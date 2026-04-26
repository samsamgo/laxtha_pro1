import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";
import { useFx2Theme } from "../context/ThemeContext";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let toastCounter = 0;

const navItems = [
  { to: "/", label: "홈" },
  { to: "/live", label: "실시간" },
  { to: "/summary", label: "요약" },
];

const hardwareLabelMap = {
  idle: "장치 대기",
  requesting: "권한 요청",
  connecting: "장치 연결 중",
  connected: "장치 연결됨",
  unsupported: "브라우저 미지원",
  error: "장치 오류",
} as const;

const sessionPhaseLabelMap = {
  idle: "준비 중",
  running: "측정 중",
  stopped: "종료됨",
} as const;

const formatDuration = (seconds: number) => {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

interface LayoutProps {
  children: ReactNode;
  title: string;
}

function SidebarSummary({
  averageBpm,
  stabilityScore,
  sessionSeconds,
}: {
  averageBpm: number;
  stabilityScore: number;
  sessionSeconds: number;
}) {
  return (
    <div className="rounded-2xl bg-[#1E293B] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        세션 인사이트
      </p>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>평균 BPM</span>
          <span className="font-semibold text-slate-100">{averageBpm} bpm</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>안정도 점수</span>
          <span className="font-semibold text-slate-100">{stabilityScore}%</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>세션 시간</span>
          <span className="font-semibold text-slate-100">
            {formatDuration(sessionSeconds)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children, title }: LayoutProps) {
  const location = useLocation();
  const { darkMode, toggleDarkMode } = useFx2Theme();
  const {
    hardwareStatus,
    selectedMode,
    sessionPhase,
    startSession,
    state,
    summary,
  } = useFx2RealtimeSession();
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const prevStatusRef = useRef<typeof hardwareStatus | null>(null);

  const addToast = (message: string, type: ToastItem["type"]) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = hardwareStatus;
    if (prev === null || prev === hardwareStatus) return;

    if (hardwareStatus === "connected") {
      addToast("장치 연결됨", "success");
    } else if (hardwareStatus === "error") {
      addToast("장치 오류 발생", "error");
    } else if (hardwareStatus === "unsupported") {
      addToast("브라우저가 이 기능을 지원하지 않습니다", "error");
    } else if (hardwareStatus === "idle" && (prev === "connected" || prev === "connecting")) {
      addToast("장치 연결 해제됨", "info");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardwareStatus]);

  const averageBpm = summary.averageHeartRate || state.heartRate;
  const canStartHardware =
    selectedMode !== "demo" &&
    (hardwareStatus === "idle" ||
      hardwareStatus === "error" ||
      hardwareStatus === "unsupported");

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-[#111827] transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed left-0 top-0 z-30 hidden h-full w-60 flex-col bg-[#0F172A] lg:flex">
        <div className="flex h-20 flex-shrink-0 items-center gap-3 border-b border-[#1E293B] px-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-xs font-bold text-white">
            FX2
          </div>
          <div>
            <p className="text-sm font-semibold text-white">FX2 Dashboard</p>
            <p className="text-[11px] text-slate-400">실시간 측정 대시보드</p>
          </div>
        </div>

        <div className="border-b border-[#1E293B] p-4">
          <div className="rounded-2xl bg-[#1E293B] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              연결 상태
            </p>
            <p className="mt-3 text-sm font-semibold text-white">
              {hardwareLabelMap[hardwareStatus]}
            </p>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>장치 모드</span>
                <span className="font-semibold text-slate-200">
                  {selectedMode.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>세션 상태</span>
                <span className="font-semibold text-slate-200">
                  {sessionPhaseLabelMap[sessionPhase]}
                </span>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Navigation
          </p>
          <div className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? "bg-[#1E293B] text-white"
                      : "text-slate-400 hover:bg-[#1E293B] hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="space-y-3 border-t border-[#1E293B] p-4">
          <button
            type="button"
            onClick={toggleDarkMode}
            className="w-full rounded-xl bg-[#1E293B] px-3 py-2 text-xs font-semibold text-slate-200 transition-colors duration-200 hover:bg-slate-700"
          >
            {darkMode ? "라이트 모드" : "다크 모드"}
          </button>
          <SidebarSummary
            averageBpm={averageBpm}
            stabilityScore={summary.stabilityScore}
            sessionSeconds={state.sessionSeconds}
          />
        </div>
      </aside>

      <header className="fixed left-0 right-0 top-0 z-20 flex h-20 items-center justify-between border-b border-gray-100 bg-white/95 px-4 shadow-sm backdrop-blur transition-colors duration-300 dark:border-slate-800 dark:bg-slate-950/95 lg:left-60 lg:px-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB] text-xs font-bold text-white">
              FX2
            </div>
            <p className="text-sm font-semibold text-[#111827] dark:text-white">
              FX2 Dashboard
            </p>
          </Link>
          <h1 className="hidden text-lg font-bold text-[#111827] dark:text-white lg:block">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileInfoOpen((current) => !current)}
            className="rounded-xl bg-[#EAF0F8] px-3 py-2 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#2563EB] hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-[#2563EB] lg:hidden"
          >
            상태
          </button>
          <button
            type="button"
            onClick={toggleDarkMode}
            className="rounded-xl bg-[#EAF0F8] px-3 py-2 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {darkMode ? "라이트" : "다크"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (canStartHardware) {
                void startSession();
              }
            }}
            disabled={!canStartHardware}
            className={`hidden rounded-xl px-4 py-2 text-right transition-colors duration-200 sm:block ${
              canStartHardware
                ? "bg-[#2563EB] text-white hover:opacity-90"
                : "cursor-default bg-[#F4F7FB] dark:bg-slate-900"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6B7280] dark:text-slate-400">
              {selectedMode.toUpperCase()} · {sessionPhaseLabelMap[sessionPhase]}
            </p>
            <p
              className={`mt-0.5 text-sm font-medium ${
                canStartHardware ? "text-white" : "text-[#111827] dark:text-white"
              }`}
            >
              {canStartHardware ? "다시 연결" : hardwareLabelMap[hardwareStatus]}
            </p>
          </button>
        </div>
      </header>

      {mobileInfoOpen ? (
        <div className="fixed left-4 right-4 top-24 z-30 grid gap-3 lg:hidden">
          <div className="fx2-card fx2-outline p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6B7280] dark:text-slate-400">
              연결 상태
            </p>
            <p className="mt-2 text-sm font-semibold text-[#111827] dark:text-white">
              {hardwareLabelMap[hardwareStatus]}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[#6B7280] dark:text-slate-400">
              <div>
                <p>장치 모드</p>
                <p className="mt-1 font-semibold text-[#111827] dark:text-white">
                  {selectedMode.toUpperCase()}
                </p>
              </div>
              <div>
                <p>세션 상태</p>
                <p className="mt-1 font-semibold text-[#111827] dark:text-white">
                  {sessionPhaseLabelMap[sessionPhase]}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-card bg-[#0F172A] p-4 shadow-card">
            <SidebarSummary
              averageBpm={averageBpm}
              stabilityScore={summary.stabilityScore}
              sessionSeconds={state.sessionSeconds}
            />
          </div>
        </div>
      ) : null}

      <main className="min-h-screen bg-[#F4F7FB] pt-20 transition-colors duration-300 dark:bg-slate-950 lg:ml-60">
        <div className="p-4 pb-24 sm:p-5 lg:pb-8">
          <h1 className="mb-5 text-2xl font-bold text-[#111827] dark:text-white lg:hidden">
            {title}
          </h1>
          {children}
        </div>
      </main>

      {toasts.length > 0 ? (
        <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-2 lg:bottom-6">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
                toast.type === "success"
                  ? "bg-emerald-500 text-white"
                  : toast.type === "error"
                  ? "bg-red-500 text-white"
                  : "bg-slate-700 text-white"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}

      <nav className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-24px)] -translate-x-1/2 rounded-2xl border border-gray-100 bg-white p-2 shadow-lg transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900 lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          {navItems.map((item) => {
            const active = location.pathname === item.to;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`rounded-xl px-3 py-2 text-center text-xs font-semibold transition-colors duration-200 ${
                  active
                    ? "bg-[#2563EB] text-white"
                    : "text-[#6B7280] dark:text-slate-400"
                }`}
              >
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
