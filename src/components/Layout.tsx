import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";

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

export default function Layout({ children, title }: LayoutProps) {
  const location = useLocation();
  const { hardwareStatus, selectedMode, sessionPhase, state, summary } =
    useFx2RealtimeSession();

  const averageBpm = summary.averageHeartRate || state.heartRate;

  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      <aside className="fixed left-0 top-0 z-30 hidden h-full w-60 flex-col bg-[#0F172A] lg:flex">
        <div className="flex h-20 flex-shrink-0 items-center gap-3 border-b border-[#1E293B] px-5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-xs font-bold text-white">
            FX2
          </div>
          <div>
            <p className="text-sm font-semibold text-white">FX2 Demo</p>
            <p className="text-[11px] text-slate-400">실시간 측정 대시보드</p>
          </div>
        </div>

        <div className="border-b border-[#1E293B] p-4">
          <div className="rounded-2xl bg-[#1E293B] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              연결 상태
            </p>
            <p className="mt-2 text-sm font-semibold text-white">
              {hardwareLabelMap[hardwareStatus]}
            </p>
            <div className="mt-3 space-y-2">
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
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
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

        <div className="border-t border-[#1E293B] p-4">
          <div className="rounded-2xl bg-[#1E293B] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              세션 인사이트
            </p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>평균 BPM</span>
                <span className="font-semibold text-slate-100">{averageBpm} bpm</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>안정성 점수</span>
                <span className="font-semibold text-slate-100">
                  {summary.stabilityScore}/100
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>세션 시간</span>
                <span className="font-semibold text-slate-100">
                  {formatDuration(state.sessionSeconds)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <header className="fixed left-0 right-0 top-0 z-20 flex h-20 items-center justify-between border-b border-gray-100 bg-white px-6 shadow-sm lg:left-60">
        <Link to="/" className="flex items-center gap-3 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2563EB] text-xs font-bold text-white">
            FX2
          </div>
          <p className="text-sm font-semibold text-[#111827]">FX2 Demo</p>
        </Link>

        <h1 className="hidden text-lg font-bold text-[#111827] lg:block">{title}</h1>

        <div className="rounded-xl bg-[#F4F7FB] px-4 py-2 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
            {selectedMode.toUpperCase()} · {sessionPhaseLabelMap[sessionPhase]}
          </p>
          <p className="mt-0.5 text-sm font-medium text-[#111827]">
            {hardwareLabelMap[hardwareStatus]}
          </p>
        </div>
      </header>

      <main className="min-h-screen bg-[#F4F7FB] pt-20 lg:ml-60">
        <div className="p-5 pb-24 lg:pb-8">
          <h1 className="mb-5 text-2xl font-bold text-[#111827] lg:hidden">{title}</h1>
          {children}
        </div>
      </main>

      <nav className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-24px)] -translate-x-1/2 rounded-2xl border border-gray-100 bg-white p-2 shadow-lg lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          {navItems.map((item) => {
            const active = location.pathname === item.to;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`rounded-xl px-3 py-2 text-center text-xs font-semibold transition-colors duration-200 ${
                  active ? "bg-[#2563EB] text-white" : "text-[#6B7280]"
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
