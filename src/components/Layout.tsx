import { Link, NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const navItems = [
  { to: "/", label: "홈" },
  { to: "/live", label: "실시간" },
  { to: "/summary", label: "요약" }
];

interface LayoutProps {
  children: ReactNode;
  title: string;
}

export default function Layout({ children, title }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-fx2-bg text-fx2-text">
      <header className="fixed left-0 right-0 top-0 z-20 flex h-header items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur lg:px-8">
        <Link to="/" className="text-xl font-bold text-fx2-primary">FX2 Demo</Link>
        <div className="hidden gap-2 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm font-medium transition ${
                  isActive ? "bg-fx2-primary text-white" : "text-fx2-muted hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </header>

      <div className="pt-header lg:flex">
        <aside className="hidden w-sidebar border-r border-slate-200 bg-white/75 p-5 lg:block">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-fx2-muted">Navigation</p>
          <div className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-2xl px-4 py-3 text-sm font-medium ${
                    isActive ? "bg-fx2-primary text-white shadow-md" : "text-fx2-muted hover:bg-slate-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </aside>

        <main className="flex-1 p-5 pb-24 md:p-8 md:pb-28 lg:pb-8">
          <h1 className="mb-cardGap text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
        </main>
      </div>

      <nav className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-24px)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-card md:hidden">
        <div className="grid grid-cols-3 gap-2">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`rounded-xl px-3 py-2 text-center text-xs font-semibold ${
                  active ? "bg-fx2-primary text-white" : "text-fx2-muted"
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
