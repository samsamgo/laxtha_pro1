import { Link, NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";

const navItems = [
  { to: "/", label: "시작" },
  { to: "/live", label: "실시간" },
  { to: "/summary", label: "요약" }
];

const connectionLabelMap = {
  waiting: "연결 시도 중",
  connected: "실시간 연결",
  disconnected: "연결 대기"
} as const;

interface LayoutProps {
  children: ReactNode;
  title: string;
}

export default function Layout({ children, title }: LayoutProps) {
  const location = useLocation();
  const { connectionStatus, sessionSource, sessionPhase } = useFx2RealtimeSession();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eff6ff_0%,_#f8fafc_42%,_#eef2ff_100%)] text-fx2-text">
      <header className="fixed left-0 right-0 top-0 z-20 border-b border-slate-200/70 bg-white/80 px-6 py-4 backdrop-blur lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white">FX2</div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fx2-primary">Laxtha Demo</p>
              <p className="text-sm text-fx2-muted">일반 사용자용 실시간 시연 프로토타입</p>
            </div>
          </Link>

          <div className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive ? "bg-slate-950 text-white" : "text-fx2-muted hover:bg-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-right shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fx2-muted">
              {sessionSource === "remote" ? "Remote Bridge" : "Local Demo"}
            </p>
            <p className="text-sm font-semibold text-fx2-text">
              {connectionLabelMap[connectionStatus]} · {sessionPhase}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-screen max-w-7xl pt-24 lg:px-6">
        <aside className="hidden w-sidebar px-2 py-8 lg:block">
          <div className="rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-card">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.26em] text-fx2-muted">Navigation</p>
            <div className="space-y-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      isActive ? "bg-slate-950 text-white" : "text-fx2-muted hover:bg-slate-100"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex-1 px-4 pb-28 pt-8 md:px-8 lg:pb-10">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
          </div>
          {children}
        </main>
      </div>

      <nav className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-24px)] -translate-x-1/2 rounded-[22px] border border-slate-200 bg-white/95 p-2 shadow-card md:hidden">
        <div className="grid grid-cols-3 gap-2">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`rounded-xl px-3 py-2 text-center text-xs font-semibold ${
                  active ? "bg-slate-950 text-white" : "text-fx2-muted"
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
