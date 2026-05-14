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
  { to: "/live", label: "실시간", icon: "live" },
  { to: "/summary", label: "요약", icon: "summary" },
] as const;

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

const hardwareDotClass = {
  idle: "bg-slate-400",
  requesting: "bg-amber-400 animate-pulse",
  connecting: "bg-amber-400 animate-pulse",
  connected: "bg-emerald-400",
  unsupported: "bg-red-400",
  error: "bg-red-500",
} as const;

interface LayoutProps {
  children: ReactNode;
  title: string;
}

function NavIcon({ kind }: { kind: "live" | "summary" }) {
  if (kind === "live") {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M3 11h2l2-5 3 10 2-7 2 4h3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M7 13V9M10 13V6M13 13v-3" strokeLinecap="round" />
    </svg>
  );
}

export default function Layout({ children, title }: LayoutProps) {
  const location = useLocation();
  const { darkMode, toggleDarkMode } = useFx2Theme();
  const { hardwareStatus, sessionPhase } = useFx2RealtimeSession();
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

    if (hardwareStatus === "error") {
      addToast("장치 오류가 발생했습니다. 케이블·블루투스 연결을 확인해 주세요.", "error");
    } else if (hardwareStatus === "unsupported") {
      addToast("이 브라우저는 Web Serial을 지원하지 않습니다. Chrome 또는 Edge를 사용해 주세요.", "error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardwareStatus]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#F4F7FB] text-[#111827] transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <a href="#main-content" className="skip-link">본문으로 건너뛰기</a>

      <aside
        aria-label="사이드 내비게이션"
        className="fixed left-0 top-0 z-30 hidden h-full w-60 flex-col bg-[#0F172A] lg:flex"
      >
        <div className="flex h-20 flex-shrink-0 items-center gap-3 border-b border-[#1E293B] px-5">
          <Link to="/live" className="flex items-center gap-3" aria-label="LAXTHA 홈으로">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563EB] to-[#06B6D4] text-xs font-bold text-white shadow-md">
              FX2
            </div>
            <div>
              <p className="text-sm font-semibold text-white">LAXTHA</p>
              <p className="text-[11px] text-slate-400">FX2 EEG Dashboard</p>
            </div>
          </Link>
        </div>

        <div className="border-b border-[#1E293B] p-4">
          <div className="rounded-2xl bg-[#1E293B] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              연결 상태
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-white">
              <span className={`inline-block h-2 w-2 rounded-full ${hardwareDotClass[hardwareStatus]}`} />
              {hardwareLabelMap[hardwareStatus]}
            </p>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>장치 모드</span>
                <span className="font-semibold text-slate-200">Web Serial</span>
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

        <nav aria-label="주 내비게이션" className="flex-1 overflow-y-auto p-4">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Navigation
          </p>
          <div className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? "bg-[#1E293B] text-white"
                      : "text-slate-400 hover:bg-[#1E293B] hover:text-white"
                  }`
                }
              >
                <NavIcon kind={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="border-t border-[#1E293B] p-4">
          <button
            type="button"
            onClick={toggleDarkMode}
            aria-pressed={darkMode}
            aria-label={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E293B] px-3 py-2 text-xs font-semibold text-slate-200 transition-colors duration-200 hover:bg-slate-700"
          >
            {darkMode ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 text-yellow-300">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
                라이트 모드
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 text-slate-300">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                </svg>
                다크 모드
              </>
            )}
          </button>
        </div>
      </aside>

      <header
        role="banner"
        className="fixed left-0 right-0 top-0 z-20 flex h-20 items-center justify-between border-b border-gray-100 bg-white/95 px-4 shadow-sm backdrop-blur transition-colors duration-300 dark:border-slate-800 dark:bg-slate-950/90 lg:left-60 lg:px-6"
      >
        <div className="flex items-center gap-3">
          <Link to="/live" className="flex items-center gap-3 lg:hidden" aria-label="LAXTHA 홈으로">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563EB] to-[#06B6D4] text-xs font-bold text-white shadow-md">
              FX2
            </div>
            <p className="text-sm font-semibold text-[#111827] dark:text-white">
              LAXTHA
            </p>
          </Link>
          <h1 className="hidden text-lg font-bold text-[#111827] dark:text-white lg:block">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Status pill — shown on tablets only (sidebar covers desktop, slide-out covers mobile) */}
          <span
            className="hidden items-center gap-2 rounded-full bg-[#EAF0F8] px-3 py-1.5 text-xs font-semibold text-[#374151] dark:bg-slate-800 dark:text-slate-200 sm:inline-flex lg:!hidden"
            role="status"
            aria-live="polite"
          >
            <span className={`inline-block h-2 w-2 rounded-full ${hardwareDotClass[hardwareStatus]}`} aria-hidden="true" />
            {hardwareLabelMap[hardwareStatus]}
          </span>
          <button
            type="button"
            onClick={() => setMobileInfoOpen((current) => !current)}
            aria-expanded={mobileInfoOpen}
            aria-controls="mobile-info-panel"
            className="rounded-xl bg-[#EAF0F8] px-3 py-2 text-xs font-semibold text-[#374151] transition-colors duration-200 hover:bg-[#2563EB] hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-[#2563EB] lg:hidden"
          >
            상태
          </button>
          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? "라이트 모드" : "다크 모드"}
            aria-pressed={darkMode}
            aria-label={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
            className="lg:hidden rounded-xl bg-[#EAF0F8] p-2 text-[#374151] transition-colors duration-200 hover:bg-[#111827] hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {darkMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4 text-yellow-400">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {mobileInfoOpen ? (
        <div id="mobile-info-panel" className="fixed left-4 right-4 top-24 z-30 grid gap-3 lg:hidden">
          <div className="fx2-card fx2-outline p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6B7280] dark:text-slate-400">
              연결 상태
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#111827] dark:text-white">
              <span className={`inline-block h-2 w-2 rounded-full ${hardwareDotClass[hardwareStatus]}`} />
              {hardwareLabelMap[hardwareStatus]}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[#6B7280] dark:text-slate-400">
              <div>
                <p>장치 모드</p>
                <p className="mt-1 font-semibold text-[#111827] dark:text-white">
                  Web Serial
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
        </div>
      ) : null}

      <main
        id="main-content"
        role="main"
        className="min-h-screen overflow-x-hidden bg-[#F4F7FB] pt-20 transition-colors duration-300 dark:bg-slate-950 lg:ml-60"
      >
        <div className="p-4 pb-28 sm:p-5 sm:pb-28 lg:pb-12">
          <h1 className="mb-5 text-2xl font-bold text-[#111827] dark:text-white lg:hidden">
            {title}
          </h1>
          {children}
        </div>

        <footer
          role="contentinfo"
          className="mt-8 hidden border-t border-gray-100 bg-white/60 px-6 py-5 text-[11px] text-[#6B7280] backdrop-blur transition-colors duration-300 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-500 lg:block"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>© {new Date().getFullYear()} LAXTHA — FX2 EEG Dashboard. 측정 데이터는 브라우저 메모리에만 저장됩니다.</p>
            <p className="text-[#9CA3AF] dark:text-slate-600">
              Chrome · Edge 권장 · Web Serial API · v1.0
            </p>
          </div>
        </footer>
      </main>

      <div
        className="fixed bottom-24 right-4 z-50 flex flex-col gap-2 lg:bottom-6"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.type === "error" ? "alert" : undefined}
            className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ring-1 ${
              toast.type === "success"
                ? "bg-emerald-500 text-white ring-emerald-400/30"
                : toast.type === "error"
                ? "bg-red-500 text-white ring-red-400/30"
                : "bg-slate-700 text-white ring-slate-500/30"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <nav
        aria-label="모바일 내비게이션"
        className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-24px)] max-w-md -translate-x-1/2 rounded-2xl border border-gray-100 bg-white/95 p-2 shadow-lg backdrop-blur transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900/95 lg:hidden"
      >
        <div className="grid grid-cols-2 gap-2">
          {navItems.map((item) => {
            const active = location.pathname === item.to;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-center text-xs font-semibold transition-colors duration-200 ${
                  active
                    ? "bg-[#2563EB] text-white"
                    : "text-[#6B7280] hover:bg-[#EAF0F8] dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <NavIcon kind={item.icon} />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
