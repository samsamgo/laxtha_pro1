import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import { Fx2RealtimeProvider } from "./context/Fx2RealtimeContext";
import { ThemeProvider } from "./context/ThemeContext";

const LivePage = lazy(() => import("./pages/LivePage"));
const SummaryPage = lazy(() => import("./pages/SummaryPage"));

const ROUTE_TITLES: Record<string, string> = {
  "/live": "실시간 측정 · LAXTHA FX2 EEG Dashboard",
  "/summary": "측정 요약 · LAXTHA FX2 EEG Dashboard",
};

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fx2-card fx2-outline animate-pulse"
    >
      <div className="h-4 w-40 rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-2 w-2/3 rounded-full bg-slate-100 dark:bg-slate-800" />
      <span className="sr-only">화면을 불러오는 중입니다.</span>
    </div>
  );
}

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title =
      ROUTE_TITLES[pathname] ?? "LAXTHA · FX2 실시간 뇌파(EEG) 대시보드";
    document.title = title;
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Fx2RealtimeProvider>
          <DocumentTitle />
          <Routes>
            <Route
              path="/live"
              element={
                <Layout title="실시간 측정 대시보드">
                  <Suspense fallback={<RouteFallback />}>
                    <LivePage />
                  </Suspense>
                </Layout>
              }
            />
            <Route
              path="/summary"
              element={
                <Layout title="측정 요약">
                  <Suspense fallback={<RouteFallback />}>
                    <SummaryPage />
                  </Suspense>
                </Layout>
              }
            />
            <Route path="*" element={<Navigate to="/live" replace />} />
          </Routes>
        </Fx2RealtimeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
