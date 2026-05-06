import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Fx2RealtimeProvider } from "./context/Fx2RealtimeContext";
import { ThemeProvider } from "./context/ThemeContext";

const LivePage = lazy(() => import("./pages/LivePage"));
const SummaryPage = lazy(() => import("./pages/SummaryPage"));

function RouteFallback() {
  return (
    <div className="fx2-card fx2-outline">
      <p className="text-sm font-semibold text-[#111827] dark:text-white">
        화면을 불러오는 중입니다.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Fx2RealtimeProvider>
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
              <Layout title="결과 요약 화면">
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
  );
}
